import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Phone, CalendarIcon, MessageSquareText, Pencil, Trash2, Cloud, CloudOff } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import CrmCombobox from '@/components/CrmCombobox';

export interface CallLogContactOption {
  id: string;
  label: string;
  secondary?: string;
}

interface Props {
  /** Contact ids whose logs should be shown. */
  contactIds: string[];
  /** Map of contact id → display name (used in multi-contact mode). */
  contactNames?: Record<string, string>;
  /** When set, new logs are pre-linked to this contact (no selector shown). */
  defaultContactId?: string;
  /** When set, new logs are linked to this task. */
  relatedTaskId?: string;
  /** Show contact picker (needed for company-level panel). */
  requireContactSelection?: boolean;
  /** Hide the editor (read-only mode). */
  readOnly?: boolean;
  /** Optional empty-state hint to show the user when nothing is logged yet. */
  emptyHint?: string;
}

interface LogRow {
  id: string;
  contactId: string;
  body: string | null;
  createdAt: string;
  ghlNoteId: string | null;
}

const pushToGhl = (activityId: string) => {
  supabase.functions
    .invoke('ghl-sync', { body: { action: 'push-call-log', activity_id: activityId } })
    .then(({ data, error }) => {
      if (error) console.warn('[GHL] push-call-log error:', error);
      else if (data?.skipped) console.log('[GHL] push-call-log skipped:', data.reason);
    });
};

const deleteOnGhl = (ghlNoteId: string, ghlContactId: string) => {
  supabase.functions
    .invoke('ghl-sync', {
      body: { action: 'delete-call-log', ghl_note_id: ghlNoteId, ghl_contact_id: ghlContactId },
    })
    .then(({ error }) => {
      if (error) console.warn('[GHL] delete-call-log error:', error);
    });
};

export default function CallLogPanel({
  contactIds,
  contactNames,
  defaultContactId,
  relatedTaskId,
  requireContactSelection,
  readOnly,
  emptyHint,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [text, setText] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedContactId, setSelectedContactId] = useState<string>(defaultContactId || '');
  const [saving, setSaving] = useState(false);

  // Edit-in-place state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [savingEdit, setSavingEdit] = useState(false);

  // Sync defaultContactId from props
  useEffect(() => {
    if (defaultContactId) setSelectedContactId(defaultContactId);
  }, [defaultContactId]);

  const fetchLogs = useCallback(async () => {
    if (!user || contactIds.length === 0) {
      setLogs([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('contact_activities')
      .select('id, contact_id, body, created_at, ghl_note_id, type, subject')
      .in('contact_id', contactIds)
      .eq('type', 'call')
      .eq('subject', 'Gespreksverslag')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: 'Fout bij laden gespreksverslagen', description: error.message, variant: 'destructive' });
    }
    setLogs(
      (data || []).map((r: any) => ({
        id: r.id,
        contactId: r.contact_id,
        body: r.body,
        createdAt: r.created_at,
        ghlNoteId: r.ghl_note_id,
      }))
    );
    setLoading(false);
  }, [user, contactIds, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const contactOptions: CallLogContactOption[] = useMemo(() => {
    if (!contactNames) return [];
    return contactIds
      .map((id) => ({ id, label: contactNames[id] || 'Onbekend' }))
      .filter((o) => o.label && o.label !== 'Onbekend');
  }, [contactIds, contactNames]);

  const handleSave = async () => {
    if (!user || !text.trim()) return;
    const contactId = requireContactSelection ? selectedContactId : defaultContactId;
    if (!contactId) {
      toast({ title: 'Kies eerst een contactpersoon', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      contact_id: contactId,
      type: 'call',
      subject: 'Gespreksverslag',
      body: text.trim(),
    };
    if (relatedTaskId) payload.related_task_id = relatedTaskId;
    if (date) payload.created_at = date.toISOString();

    const { data: inserted, error } = await supabase
      .from('contact_activities')
      .insert(payload)
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Fout bij opslaan', description: error.message, variant: 'destructive' });
      return;
    }
    setText('');
    setDate(new Date());
    toast({ title: 'Gespreksverslag opgeslagen', description: 'Wordt gesynchroniseerd met CliqCRM…' });
    fetchLogs();
    if (inserted?.id) pushToGhl(inserted.id);
  };

  const handleSaveEdit = async (logId: string) => {
    if (!editText.trim()) return;
    setSavingEdit(true);
    const patch: any = { body: editText.trim() };
    if (editDate) patch.created_at = editDate.toISOString();
    const { error } = await supabase.from('contact_activities').update(patch).eq('id', logId);
    setSavingEdit(false);
    if (error) {
      toast({ title: 'Fout bij bijwerken', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Verslag bijgewerkt', description: 'Wijziging wordt doorgezet naar CliqCRM…' });
    setEditingId(null);
    fetchLogs();
    // Push update to GHL — push-call-log uses PUT when ghl_note_id is present
    pushToGhl(logId);
  };

  const handleDelete = async (log: LogRow) => {
    // Lookup ghl_contact_id before deletion
    let ghlContactId: string | null = null;
    if (log.ghlNoteId) {
      const { data: c } = await supabase
        .from('contacts')
        .select('ghl_contact_id')
        .eq('id', log.contactId)
        .single();
      ghlContactId = c?.ghl_contact_id || null;
    }
    const { error } = await supabase.from('contact_activities').delete().eq('id', log.id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Verslag verwijderd' });
    fetchLogs();
    if (log.ghlNoteId && ghlContactId) deleteOnGhl(log.ghlNoteId, ghlContactId);
  };

  const showContactBadge = !defaultContactId && Object.keys(contactNames || {}).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Phone size={15} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground leading-tight">Gespreksverslagen</h3>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Telefoongesprekken — synchroniseert met CliqCRM
          </p>
        </div>
      </div>

      {/* Editor */}
      {!readOnly && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          {requireContactSelection && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Contactpersoon *</p>
              <CrmCombobox
                options={contactOptions}
                value={selectedContactId}
                onSelect={(id) => setSelectedContactId(id)}
                placeholder="Kies de gesprekspartner..."
                searchPlaceholder="Zoek contact..."
              />
            </div>
          )}
          <Textarea
            placeholder="Typ hier het verslag van het (telefoon)gesprek..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="resize-y bg-background"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon size={12} />
                  {date ? format(date, 'd MMM yyyy', { locale: nl }) : 'Datum'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText('');
                setDate(new Date());
              }}
              disabled={saving || !text}
            >
              Wissen
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
              <MessageSquareText size={14} className="mr-1" />
              {saving ? 'Opslaan...' : 'Verslag opslaan'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Laden...</p>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {emptyHint || 'Nog geen gespreksverslagen — leg het eerste gesprek vast.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {logs.map((log) => {
            const isEditing = editingId === log.id;
            return (
              <div
                key={log.id}
                className="flex gap-3 text-sm rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
              >
                <Phone size={14} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  {isEditing ? (
                    <>
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-h-[100px] text-sm bg-background"
                      />
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="text-xs h-8">
                              <CalendarIcon size={12} className="mr-1.5" />
                              {editDate ? format(editDate, 'd MMM yyyy', { locale: nl }) : 'Datum'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                            <Calendar mode="single" selected={editDate} onSelect={setEditDate} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={savingEdit}>
                          Annuleren
                        </Button>
                        <Button size="sm" disabled={savingEdit || !editText.trim()} onClick={() => handleSaveEdit(log.id)}>
                          Opslaan
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(log.createdAt), 'd MMM yyyy HH:mm', { locale: nl })}
                        </span>
                        {showContactBadge && contactNames?.[log.contactId] && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            {contactNames[log.contactId]}
                          </span>
                        )}
                        <span
                          className={cn(
                            'inline-flex items-center gap-0.5 text-[10px]',
                            log.ghlNoteId ? 'text-muted-foreground' : 'text-amber-600'
                          )}
                          title={log.ghlNoteId ? 'Gesynchroniseerd met CliqCRM' : 'Nog niet gesynchroniseerd'}
                        >
                          {log.ghlNoteId ? <Cloud size={10} /> : <CloudOff size={10} />}
                        </span>
                      </div>
                      {log.body && <p className="text-sm text-foreground whitespace-pre-wrap">{log.body}</p>}
                    </>
                  )}
                </div>
                {!isEditing && !readOnly && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setEditingId(log.id);
                        setEditText(log.body || '');
                        setEditDate(log.createdAt ? new Date(log.createdAt) : undefined);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Bewerken"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(log)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Verwijderen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
