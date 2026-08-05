import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Inquiry } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useDocuments } from '@/hooks/useDocuments';
import { useContacts } from '@/hooks/useContacts';
import { useRoomSettings } from '@/hooks/useRoomSettings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ChevronRight, History, CheckSquare, FileText, Send, Eye, CheckCircle2, MessageSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import InquiryDetailsTab, { PIPELINE_COLUMNS } from '@/components/inquiry/InquiryDetailsTab';
import { SectionCard } from '@/components/detail/DetailPageComponents';
import InquiryHistoryTab from '@/components/inquiry/InquiryHistoryTab';
import TasksSection from '@/components/detail/TasksSection';
import NewReservationDialog from '@/components/calendar/NewReservationDialog';
import InquiryStatusChangeDialog from '@/components/inquiry/InquiryStatusChangeDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ConflictAlertDialog from '@/components/calendar/ConflictAlertDialog';
import { Booking } from '@/types/crm';


export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { inquiries, loading: inquiriesLoading, updateInquiry, deleteInquiry, markAsRead, refetch } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { bookings, addBooking } = useBookings();
  const { tasks } = useTasksContext();
  const { toast } = useToast();
  const { user } = useAuth();
  const { contacts: contactOptions, loading: contactsLoading } = useContacts();
  const { getDisplayName } = useRoomSettings();
  const { documents } = useDocuments();

  const inquiry = inquiries.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Inquiry | null>(null);
  const [showReservationDialog, setShowReservationDialog] = useState(false);
  const [reservationStatus, setReservationStatus] = useState<'confirmed' | 'option'>('confirmed');
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [conflictPopup, setConflictPopup] = useState<{ conflicts: Booking[] } | null>(null);

  // Mark as read when opening
  useEffect(() => {
    if (inquiry && !inquiry.isRead) {
      markAsRead(inquiry.id);
    }
  }, [inquiry?.id, inquiry?.isRead, markAsRead]);

  const contact = useMemo(() => inquiry?.contactId ? contacts.find(c => c.id === inquiry.contactId) : null, [inquiry, contacts]);
  const company = useMemo(() => {
    if (!inquiry) return null;
    // First try direct company_id on inquiry
    if (inquiry.companyId) return companies.find(co => co.id === inquiry.companyId) || null;
    // Fallback to contact's company
    if (contact?.companyId) return companies.find(co => co.id === contact.companyId) || null;
    return null;
  }, [inquiry, contact, companies]);
  const contactBookings = useMemo(() => inquiry?.contactId ? bookings.filter(b => b.contactId === inquiry.contactId) : [], [bookings, inquiry]);
  const existingOption = useMemo(() => {
    if (!inquiry) return null;
    const candidates = bookings.filter(b => b.status === 'option' && (
      (inquiry.contactId && b.contactId === inquiry.contactId) ||
      (inquiry.contactName && b.contactName?.toLowerCase() === inquiry.contactName.toLowerCase())
    ));
    if (!candidates.length) return null;
    // Prefer match on preferredDate
    const dateMatch = inquiry.preferredDate ? candidates.find(b => b.date === inquiry.preferredDate) : null;
    const chosen = dateMatch || candidates[0];
    return { id: chosen.id, date: chosen.date };
  }, [bookings, inquiry]);
  const inquiryOptionBookings = useMemo(() => {
    if (!inquiry) return [] as Booking[];
    return bookings.filter(b => b.status === 'option' && (
      (inquiry.contactId && b.contactId === inquiry.contactId) ||
      (inquiry.companyId && b.companyId === inquiry.companyId) ||
      (inquiry.contactName && b.contactName?.toLowerCase() === inquiry.contactName.toLowerCase())
    ));
  }, [bookings, inquiry]);
  const companyBookings = useMemo(() => company?.id ? bookings.filter(b => {
    const bc = contacts.find(c => c.id === b.contactId);
    return bc?.companyId === company.id;
  }) : [], [bookings, company, contacts]);
  const contactInquiries = useMemo(() => inquiry?.contactId ? inquiries.filter(i => i.contactId === inquiry.contactId && i.id !== id) : [], [inquiries, inquiry, id]);
  const inquiryTasks = useMemo(() => inquiry ? tasks.filter(t => t.inquiryId === inquiry.id || (!t.inquiryId && inquiry.contactId && t.contactId === inquiry.contactId)) : [], [tasks, inquiry]);
  const inquiryDocuments = useMemo(() => inquiry ? documents.filter(d => d.inquiryId === inquiry.id || (d.contactId && d.contactId === inquiry.contactId)) : [], [documents, inquiry]);
  const col = useMemo(() => inquiry ? PIPELINE_COLUMNS.find(c => c.key === inquiry.status) : null, [inquiry]);

  const openTaskCount = inquiryTasks.filter(t => t.status !== 'completed').length;

  if (inquiriesLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-20" />
          <ChevronRight size={14} />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Aanvraag niet gevonden</p>
          <Button variant="outline" onClick={() => navigate('/inquiries')}>
            <ArrowLeft size={14} className="mr-1" /> Terug naar Aanvragen
          </Button>
        </div>
      </div>
    );
  }

  // Helper: log activity to contact timeline
  const logActivity = async (subject: string, body?: string) => {
    if (!user || !inquiry.contactId) return;
    await supabase.from('contact_activities').insert({
      user_id: user.id,
      contact_id: inquiry.contactId,
      type: 'note',
      subject,
      body: body || null,
    });
  };

  const startEdit = () => { setForm({ ...inquiry }); setEditing(true); };
  const cancelEdit = () => { setForm(null); setEditing(false); };
  const saveEdit = async () => {
    if (!form) return;
    if (!form.contactName || !form.eventType) {
      toast({ title: 'Vul minimaal naam en type in', variant: 'destructive' });
      return;
    }
    await updateInquiry(form);
    setEditing(false);
    setForm(null);
    toast({ title: 'Aanvraag bijgewerkt' });
    // Log edit to contact activity timeline
    await logActivity(
      `Aanvraag bewerkt – ${form.eventType}`,
      `Aanvraag ${inquiry.displayNumber || ''} is bijgewerkt.`
    );
  };
  const handleDelete = async () => {
    await deleteInquiry(inquiry.id);
    toast({ title: 'Aanvraag verwijderd' });
    navigate('/inquiries');
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/inquiries')} className="hover:text-foreground transition-colors">Aanvragen</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">
          {inquiry.displayNumber && <span className="font-mono text-xs text-muted-foreground mr-2">{inquiry.displayNumber}</span>}
          {inquiry.eventType}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{inquiry.eventType}</h1>
        <Select
          value={inquiry.status}
          onValueChange={async (v: Inquiry['status']) => {
            const oldLabel = PIPELINE_COLUMNS.find(c => c.key === inquiry.status)?.label;
            const newLabel = PIPELINE_COLUMNS.find(c => c.key === v)?.label;
            await updateInquiry({ ...inquiry, status: v });
            toast({ title: 'Status gewijzigd', description: newLabel });
            await logActivity(
              `Stadium gewijzigd: ${oldLabel} → ${newLabel}`,
              `Aanvraag ${inquiry.displayNumber || inquiry.eventType} is van stadium "${oldLabel}" naar "${newLabel}" gezet.`
            );
          }}
        >
          <SelectTrigger className={cn('w-auto h-7 text-[11px] font-medium rounded-full px-3 border-0', col?.badgeClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_COLUMNS.map(c => (
              <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!inquiry.isRead && <Badge className="bg-destructive text-destructive-foreground text-[10px]">Nieuw</Badge>}
      </div>

      {/* Details */}
      <InquiryDetailsTab
        inquiry={inquiry}
        editing={editing}
        form={form}
        setForm={setForm}
        contact={contact}
        company={company}
        onSave={saveEdit}
        onCancel={cancelEdit}
        onDelete={() => setDeleteConfirmOpen(true)}
        onStartEdit={startEdit}
        onConvert={() => { setReservationStatus('confirmed'); setShowReservationDialog(true); }}
        onCreateOption={() => { setReservationStatus('option'); setShowReservationDialog(true); }}
        onStatusChange={() => setShowStatusDialog(true)}
        refetch={refetch}
        existingOption={existingOption}
      />

      {/* Opties */}
      <SectionCard
        title="Opties"
        count={inquiryOptionBookings.length}
        linkLabel="Bekijk agenda"
        onLink={() => navigate('/calendar')}
        onAdd={() => { setReservationStatus('option'); setShowReservationDialog(true); }}
      >
        {inquiryOptionBookings.length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen opties</p>
        ) : (
          <div className="space-y-1">
            {inquiryOptionBookings
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/reserveringen/${b.id}`)}
                  className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{b.title}</span>
                    <span className="text-muted-foreground ml-2">{b.roomName}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}
                  </span>
                </button>
              ))}
          </div>
        )}
      </SectionCard>

      {/* Historie */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <History size={16} /> Historie
          {(contactBookings.length + contactInquiries.length) > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{contactBookings.length + contactInquiries.length}</Badge>
          )}
        </h2>
        <InquiryHistoryTab
          inquiry={inquiry}
          contactBookings={contactBookings}
          companyBookings={companyBookings}
          contactInquiries={contactInquiries}
        />
      </div>

      {/* Documenten */}
      {inquiryDocuments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText size={16} /> Documenten
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{inquiryDocuments.length}</Badge>
          </h2>
          <div className="rounded-xl border bg-card p-4 card-shadow space-y-2">
            {inquiryDocuments.map((d) => {
              const statusIcon = d.status === 'signed' ? <CheckCircle2 size={12} className="text-success" /> : d.status === 'viewed' ? <Eye size={12} className="text-warning" /> : <Send size={12} className="text-info" />;
              const statusLabel = d.status === 'signed' ? 'Ondertekend' : d.status === 'viewed' ? 'Bekeken' : d.status === 'declined' ? 'Afgewezen' : 'Verzonden';
              return (
                <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/50 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">{d.title}</span>
                    {d.amount && <span className="text-muted-foreground text-xs">€{d.amount.toLocaleString('nl-NL')}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusIcon}
                    <span className="text-xs text-muted-foreground">{statusLabel}</span>
                    <span className="text-xs text-muted-foreground">{d.sentAt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Taken */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CheckSquare size={16} /> Taken
          {openTaskCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-warning/15 text-warning">{openTaskCount}</Badge>
          )}
        </h2>
        <TasksSection
          tasks={inquiryTasks}
          defaults={{ inquiryId: inquiry.id, contactId: contact?.id, companyId: company?.id }}
        />
      </div>

      {/* Gesprekverslag */}
      {contact && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquare size={16} /> Gesprekverslag
          </h2>
          <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
            <Textarea
              placeholder="Schrijf een gesprekverslag... Dit wordt opgeslagen bij de contactpersoon en het bedrijf."
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={savingReport || !reportText.trim()}
                onClick={async () => {
                  if (!user || !contact) return;
                  setSavingReport(true);
                  await (supabase as any).from('contact_activities').insert({
                    user_id: user.id,
                    contact_id: contact.id,
                    type: 'note',
                    subject: `Gesprekverslag – ${inquiry.eventType}`,
                    body: reportText.trim(),
                  });
                  setReportText('');
                  setSavingReport(false);
                  toast({ title: 'Gesprekverslag opgeslagen', description: 'Zichtbaar bij contactpersoon en bedrijf.' });
                }}
              >
                <MessageSquare size={14} className="mr-1" /> Opslaan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change dialog */}
      <InquiryStatusChangeDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        currentStatus={inquiry.status}
        onConfirm={async (newStatus, reason) => {
          const oldLabel = PIPELINE_COLUMNS.find(c => c.key === inquiry.status)?.label;
          const newLabel = PIPELINE_COLUMNS.find(c => c.key === newStatus)?.label;
          await updateInquiry({ ...inquiry, status: newStatus, statusReason: reason });
          setShowStatusDialog(false);
          toast({ title: 'Stadium gewijzigd', description: newLabel });
          await logActivity(
            `Stadium gewijzigd: ${oldLabel} → ${newLabel}`,
            reason
          );
        }}
      />

      {/* Convert to Reservation dialog */}
      <NewReservationDialog
        open={showReservationDialog}
        onOpenChange={setShowReservationDialog}
        companies={companies}
        onSubmit={async (resForm) => {
          // addBooking has built-in conflict checking
          const result = await addBooking({
            roomName: resForm.room,
            date: resForm.date,
            startHour: resForm.startHour,
            startMinute: resForm.startMinute,
            endHour: resForm.endHour,
            endMinute: resForm.endMinute,
            title: resForm.title,
            contactName: resForm.contactName,
            contactId: resForm.contactId || undefined,
            companyId: resForm.companyId || inquiry.companyId || undefined,
            status: resForm.status,
            notes: resForm.notes || undefined,
            guestCount: resForm.guestCount,
            roomSetup: resForm.roomSetup || undefined,
          });
          if (!result.success) {
            if (result.conflicts) setConflictPopup({ conflicts: result.conflicts });
            return;
          }
          // Update inquiry status based on booking type
          const newStatus: Inquiry['status'] = resForm.status === 'confirmed' ? 'reserved' : 'option';
          await updateInquiry({ ...inquiry, status: newStatus });
          setShowReservationDialog(false);
          toast({ title: 'Reservering aangemaakt' });
        }}
        contacts={contactOptions}
        contactsLoading={contactsLoading}
        conflictAlert={null}
        getRoomDisplayName={getDisplayName}
        initialStartHour={inquiry.preferredStartTime ? parseInt(inquiry.preferredStartTime.split(':')[0]) : undefined}
        initialStatus={reservationStatus}
        prefill={{
          title: inquiry.eventType,
          contactName: inquiry.contactName,
          contactId: inquiry.contactId,
          companyId: inquiry.companyId || company?.id,
          date: inquiry.preferredDate || '',
          roomName: inquiry.roomPreference || '',
          guestCount: inquiry.guestCount,
          startTime: inquiry.preferredStartTime || undefined,
          endTime: inquiry.preferredEndTime || undefined,
        }}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aanvraag verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{inquiry.eventType}</strong> van {inquiry.contactName} wilt verwijderen? De aanvraag wordt ook verwijderd uit VirtuGrow en kan niet worden teruggehaald.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Definitief verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict Alert Dialog */}
      <ConflictAlertDialog
        open={!!conflictPopup}
        onOpenChange={(open) => !open && setConflictPopup(null)}
        conflicts={conflictPopup?.conflicts || []}
        getRoomDisplayName={getDisplayName}
      />
    </div>
  );
}
