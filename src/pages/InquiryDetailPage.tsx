import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import { Inquiry } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useContacts } from '@/hooks/useContacts';
import { useRoomSettings } from '@/hooks/useRoomSettings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ChevronRight, History, CheckSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import InquiryDetailsTab, { PIPELINE_COLUMNS } from '@/components/inquiry/InquiryDetailsTab';
import InquiryHistoryTab from '@/components/inquiry/InquiryHistoryTab';
import InquiryTasksTab from '@/components/inquiry/InquiryTasksTab';
import NewReservationDialog from '@/components/calendar/NewReservationDialog';


export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { inquiries, loading: inquiriesLoading, updateInquiry, deleteInquiry, markAsRead, refetch } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const { bookings, addBooking } = useBookings();
  const { tasks } = useTasksContext();
  const { toast } = useToast();
  const { contacts: contactOptions, loading: contactsLoading } = useContacts();
  const { getDisplayName } = useRoomSettings();

  const inquiry = inquiries.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Inquiry | null>(null);
  const [showReservationDialog, setShowReservationDialog] = useState(false);

  // Mark as read when opening
  useEffect(() => {
    if (inquiry && !inquiry.isRead) {
      markAsRead(inquiry.id);
    }
  }, [inquiry?.id]);

  const contact = useMemo(() => inquiry?.contactId ? contacts.find(c => c.id === inquiry.contactId) : null, [inquiry, contacts]);
  const company = useMemo(() => contact?.companyId ? companies.find(co => co.id === contact.companyId) : null, [contact, companies]);
  const contactBookings = useMemo(() => inquiry?.contactId ? bookings.filter(b => b.contactId === inquiry.contactId) : [], [bookings, inquiry]);
  const companyBookings = useMemo(() => company?.id ? bookings.filter(b => {
    const bc = contacts.find(c => c.id === b.contactId);
    return bc?.companyId === company.id;
  }) : [], [bookings, company, contacts]);
  const contactInquiries = useMemo(() => inquiry?.contactId ? inquiries.filter(i => i.contactId === inquiry.contactId && i.id !== id) : [], [inquiries, inquiry, id]);
  const inquiryTasks = useMemo(() => inquiry ? tasks.filter(t => t.inquiryId === inquiry.id) : [], [tasks, inquiry]);
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
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">{inquiry.eventType}</h1>
        <Badge variant="secondary" className={cn('text-[11px] font-medium', col?.badgeClass)}>{col?.label}</Badge>
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
        onDelete={handleDelete}
        onStartEdit={startEdit}
        onConvert={() => setShowReservationDialog(true)}
        refetch={refetch}
      />

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

      {/* Taken */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CheckSquare size={16} /> Taken
          {openTaskCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-warning/15 text-warning">{openTaskCount}</Badge>
          )}
        </h2>
        <InquiryTasksTab
          inquiry={inquiry}
          tasks={inquiryTasks}
          contactId={contact?.id}
          companyId={company?.id}
        />
      </div>

      {/* Convert to Reservation dialog */}
      <NewReservationDialog
        open={showReservationDialog}
        onOpenChange={setShowReservationDialog}
        onSubmit={async (resForm) => {
          await addBooking({
            roomName: resForm.room,
            date: resForm.date,
            startHour: resForm.startHour,
            startMinute: resForm.startMinute,
            endHour: resForm.endHour,
            endMinute: resForm.endMinute,
            title: resForm.title,
            contactName: resForm.contactName,
            contactId: resForm.contactId || undefined,
            status: resForm.status,
            notes: resForm.notes || undefined,
            guestCount: resForm.guestCount,
            roomSetup: resForm.roomSetup || undefined,
          });
          setShowReservationDialog(false);
          toast({ title: 'Reservering aangemaakt' });
        }}
        contacts={contactOptions}
        contactsLoading={contactsLoading}
        conflictAlert={null}
        getRoomDisplayName={getDisplayName}
        prefill={{
          title: inquiry.eventType,
          contactName: inquiry.contactName,
          contactId: inquiry.contactId,
          date: inquiry.preferredDate || '',
          roomName: inquiry.roomPreference || '',
          guestCount: inquiry.guestCount,
        }}
      />
    </div>
  );
}
