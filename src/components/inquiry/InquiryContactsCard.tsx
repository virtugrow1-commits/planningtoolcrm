import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useToast } from '@/hooks/use-toast';
import { Inquiry, Contact } from '@/types/crm';
import { SectionCard } from '@/components/detail/DetailPageComponents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CrmCombobox, { ComboboxOption } from '@/components/CrmCombobox';
import { formatDate } from '@/lib/formatters';
import { Mail, Phone, Star, X, UserPlus } from 'lucide-react';

interface Row { id: string; contact_id: string; is_primary: boolean; role: string | null }

const fullName = (c?: Contact) => c ? [c.firstName, c.infix, c.lastName].filter((n) => n && n !== '—').join(' ') || c.email || 'Onbekend' : 'Onbekend';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{6,20}$/;

export default function InquiryContactsCard({ inquiry }: { inquiry: Inquiry }) {
  const { user } = useAuth();
  const { contacts, addContact, refetch } = useContactsContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('link');
  const [pick, setPick] = useState('');
  const [nf, setNf] = useState({ firstName: '', lastName: '', email: '', mobile: '', birthDate: '' });
  const [busy, setBusy] = useState(false);
  const [removeRow, setRemoveRow] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).from('inquiry_contacts').select('id, contact_id, is_primary, role').eq('inquiry_id', inquiry.id);
    if (error) { toast({ title: 'Fout bij laden contactpersonen', description: error.message, variant: 'destructive' }); setRows([]); return; }
    setRows(data || []);
  }, [inquiry.id, toast]);
  useEffect(() => { load(); }, [load, inquiry.contactId]);

  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary)), [rows]);
  const linked = new Set((rows || []).map((r) => r.contact_id));

  const options = useMemo<ComboboxOption[]>(() => {
    const pool = contacts.filter((c) => !c.departed && !linked.has(c.id) && (!inquiry.companyId || c.companyId === inquiry.companyId));
    return pool.map((c) => ({ id: c.id, label: fullName(c), secondary: c.email || c.jobTitle || undefined, searchText: `${c.firstName} ${c.lastName} ${c.email || ''}` }));
  }, [contacts, rows, inquiry.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (contactId: string) => {
    if (!user) return;
    const makePrimary = (rows || []).length === 0;
    const { error } = await (supabase as any).from('inquiry_contacts').insert({ inquiry_id: inquiry.id, contact_id: contactId, is_primary: makePrimary, user_id: user.id });
    if (error) { toast({ title: 'Koppelen mislukt', description: error.message, variant: 'destructive' }); return false; }
    if (makePrimary) await supabase.from('inquiries').update({ contact_id: contactId } as any).eq('id', inquiry.id);
    return true;
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      if (tab === 'link') {
        if (!pick) return;
        if (await link(pick)) { toast({ title: 'Contactpersoon gekoppeld aan aanvraag' }); setOpen(false); setPick(''); }
      } else {
        if (!nf.firstName.trim() || !nf.lastName.trim()) { toast({ title: 'Voor- en achternaam zijn verplicht', variant: 'destructive' }); return; }
        if (nf.email && !EMAIL_RE.test(nf.email)) { toast({ title: 'Ongeldig e-mailadres', variant: 'destructive' }); return; }
        if (nf.mobile && !PHONE_RE.test(nf.mobile)) { toast({ title: 'Ongeldig telefoonnummer', variant: 'destructive' }); return; }
        if (nf.birthDate && nf.birthDate > new Date().toISOString().slice(0, 10)) { toast({ title: 'Geboortedatum mag niet in de toekomst liggen', variant: 'destructive' }); return; }
        const res = await addContact({ firstName: nf.firstName, lastName: nf.lastName, email: nf.email, phone: nf.mobile, companyId: inquiry.companyId, status: 'client', birthDate: nf.birthDate || undefined } as any);
        if (!res) return;
        let q = supabase.from('contacts').select('id').ilike('first_name', nf.firstName.trim()).ilike('last_name', nf.lastName.trim()).order('created_at', { ascending: false }).limit(1);
        const { data } = await q.maybeSingle();
        if (data?.id) {
          if (nf.mobile) await (supabase as any).from('contacts').update({ mobile: nf.mobile }).eq('id', data.id);
          if (await link(data.id)) { toast({ title: 'Contactpersoon aangemaakt en gekoppeld' }); setOpen(false); setNf({ firstName: '', lastName: '', email: '', mobile: '', birthDate: '' }); refetch(); }
        }
      }
    } finally { setBusy(false); load(); }
  };

  const makePrimary = async (r: Row) => {
    await (supabase as any).from('inquiry_contacts').update({ is_primary: false }).eq('inquiry_id', inquiry.id).eq('is_primary', true);
    const { error } = await (supabase as any).from('inquiry_contacts').update({ is_primary: true }).eq('id', r.id);
    if (error) { toast({ title: 'Wijzigen mislukt', description: error.message, variant: 'destructive' }); }
    else { await supabase.from('inquiries').update({ contact_id: r.contact_id } as any).eq('id', inquiry.id); toast({ title: 'Primaire contactpersoon gewijzigd' }); }
    load();
  };

  const remove = async () => {
    if (!removeRow) return;
    const { error } = await (supabase as any).from('inquiry_contacts').delete().eq('id', removeRow.id);
    if (error) toast({ title: 'Verwijderen mislukt', description: error.message, variant: 'destructive' });
    else toast({ title: 'Contactpersoon losgekoppeld van aanvraag' });
    setRemoveRow(null); load();
  };

  return (
    <>
      <SectionCard title="Contactpersonen van deze aanvraag" count={rows?.length} actionLabel="Contactpersoon toevoegen aan aanvraag" onAction={() => setOpen(true)}>
        {rows === null ? (
          <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen contactpersoon gekoppeld</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => {
              const c = byId.get(r.contact_id);
              const mobile = c?.mobile || c?.phone;
              return (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <button className="text-sm font-medium text-foreground hover:text-primary" onClick={() => navigate(`/crm/${r.contact_id}`)}>{fullName(c)}</button>
                      {r.is_primary && <Badge className="text-[10px] h-4 px-1.5">Primair</Badge>}
                      {c?.departed && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Uit dienst</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {c?.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail size={11} />{c.email}</a> : <span>Geen e-mail</span>}
                      {mobile ? <a href={`tel:${mobile.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone size={11} />{mobile}</a> : <span>Geen telefoon</span>}
                      <span>{c?.birthDate ? formatDate(c.birthDate) : 'Geen geboortedatum'}</span>
                    </div>
                  </div>
                  {!r.is_primary && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Maak primair" onClick={() => makePrimary(r)}><Star size={13} /></Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Loskoppelen" onClick={() => setRemoveRow(r)}><X size={13} /></Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Contactpersoon toevoegen aan aanvraag</DialogTitle></DialogHeader>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="link" className="flex-1">Bestaande contactpersoon</TabsTrigger>
              <TabsTrigger value="new" className="flex-1">Nieuwe contactpersoon</TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="pt-3">
              {options.length === 0 ? <p className="text-xs text-muted-foreground">Geen andere contactpersonen bij dit bedrijf. Maak een nieuwe aan.</p> :
                <CrmCombobox options={options} value={pick} onSelect={setPick} placeholder="Kies contactpersoon..." searchPlaceholder="Zoek contactpersoon..." />}
            </TabsContent>
            <TabsContent value="new" className="pt-3 grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Voornaam *</Label><Input value={nf.firstName} onChange={(e) => setNf({ ...nf, firstName: e.target.value })} /></div>
              <div><Label className="text-xs">Achternaam *</Label><Input value={nf.lastName} onChange={(e) => setNf({ ...nf, lastName: e.target.value })} /></div>
              <div><Label className="text-xs">E-mail</Label><Input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></div>
              <div><Label className="text-xs">Mobiel</Label><Input value={nf.mobile} onChange={(e) => setNf({ ...nf, mobile: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Geboortedatum</Label><Input type="date" max={new Date().toISOString().slice(0, 10)} value={nf.birthDate} onChange={(e) => setNf({ ...nf, birthDate: e.target.value })} /></div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={handleAdd} disabled={busy || (tab === 'link' && !pick)}><UserPlus size={14} className="mr-1" />{busy ? 'Bezig…' : 'Toevoegen'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeRow} onOpenChange={(o) => !o && setRemoveRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contactpersoon loskoppelen?</AlertDialogTitle>
            <AlertDialogDescription>De contactpersoon blijft bestaan bij het bedrijf, maar hoort niet meer bij deze aanvraag.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Loskoppelen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
