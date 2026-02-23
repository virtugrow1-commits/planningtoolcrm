import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useBookings } from '@/contexts/BookingsContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Booking, RoomName, ROOMS } from '@/types/crm';
import { Search, Edit2, ArrowRightLeft, Calendar as CalendarIcon, Clock, MapPin, ChevronLeft, ChevronRight, History, Hash, ClipboardCheck, Download } from 'lucide-react';
import { exportToCSV } from '@/lib/csvExport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import BulkActionBar from '@/components/BulkActionBar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type EnrichedBooking = Booking & { company: string; isPast: boolean };

export default function ReserveringenPage() {
  const { bookings, updateBooking, deleteBooking, loading } = useBookings();
  const { contacts: fullContacts } = useContactsContext();
  const { companies } = useCompaniesContext();
  const contacts = fullContacts.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email || null, company: c.company || null, companyId: c.companyId || null }));
  const { t } = useLanguage();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [tab, setTab] = useState<'all' | 'confirmed' | 'option'>('all');
  const [pageSize, setPageSize] = useState(20);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<{ status?: 'confirmed' | 'option'; preparationStatus?: string }>({});
  const [bulkEditConfirmOpen, setBulkEditConfirmOpen] = useState(false);

  const availableRooms = useMemo(() => [...ROOMS], []);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const enrichedBookings = useMemo<EnrichedBooking[]>(() => {
    return bookings
      .filter(b => b.roomName !== 'Ontmoeten Aan de Donge')
      .map(b => {
        const contact = b.contactId ? contacts.find(c => c.id === b.contactId) : null;
        const companyName = contact?.company || (contact?.companyId ? companies.find(co => co.id === contact.companyId)?.name : null) || '-';
        return { ...b, company: companyName, isPast: b.date < todayStr };
      });
  }, [bookings, contacts, companies, todayStr]);

  const applyFilters = (list: EnrichedBooking[]) => {
    if (tab === 'confirmed') list = list.filter(b => b.status === 'confirmed');
    else if (tab === 'option') list = list.filter(b => b.status === 'option');
    if (search.trim()) {
      const terms = search.toLowerCase().split(/\s+/);
      list = list.filter(b =>
        terms.every(term =>
          b.contactName.toLowerCase().includes(term) ||
          b.company.toLowerCase().includes(term) ||
          b.roomName.toLowerCase().includes(term) ||
          b.title.toLowerCase().includes(term) ||
          b.date.includes(term)
        )
      );
    }
    return list;
  };

  const upcoming = useMemo(() => {
    return applyFilters(enrichedBookings.filter(b => !b.isPast)).sort((a, b) => a.date.localeCompare(b.date));
  }, [enrichedBookings, tab, search]);

  const past = useMemo(() => {
    return applyFilters(enrichedBookings.filter(b => b.isPast)).sort((a, b) => b.date.localeCompare(a.date));
  }, [enrichedBookings, tab, search]);

  useMemo(() => { setUpcomingPage(1); setPastPage(1); }, [tab, search, pageSize]);

  const paginate = <T,>(items: T[], page: number) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  };
  const totalPages = (total: number) => Math.max(1, Math.ceil(total / pageSize));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: EnrichedBooking[]) => {
    const allIds = items.map(b => b.id);
    const allSelected = allIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    for (const id of selected) {
      await deleteBooking(id);
    }
    setSelected(new Set());
    toast({ title: `${count} reservering(en) verwijderd` });
  };

  const handleBulkEditConfirm = async () => {
    const count = selected.size;
    for (const id of selected) {
      const booking = bookings.find(b => b.id === id);
      if (booking) {
        await updateBooking({
          ...booking,
          ...(bulkEditField.status ? { status: bulkEditField.status } : {}),
          ...(bulkEditField.preparationStatus ? { preparationStatus: bulkEditField.preparationStatus as any } : {}),
        });
      }
    }
    setSelected(new Set());
    setBulkEditOpen(false);
    setBulkEditConfirmOpen(false);
    setBulkEditField({});
    toast({ title: `${count} reservering(en) bijgewerkt` });
  };

  const openEdit = (booking: EnrichedBooking) => {
    const { company, isPast, ...rest } = booking;
    setEditBooking({ ...rest });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editBooking) return;
    await updateBooking(editBooking);
    setEditOpen(false);
    toast({ title: 'Reservering bijgewerkt' });
  };

  const handleConvertToReservation = async () => {
    if (!editBooking) return;
    await updateBooking({ ...editBooking, status: 'confirmed' as const });
    setEditOpen(false);
    toast({ title: 'Optie omgezet naar reservering', description: editBooking.title });
  };

  const formatTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'EEE d MMM yyyy', { locale: nl });
    } catch { return dateStr; }
  };

  const confirmedCount = enrichedBookings.filter(b => b.status === 'confirmed' && !b.isPast).length;
  const optionCount = enrichedBookings.filter(b => b.status === 'option' && !b.isPast).length;

  const prepStatusLabel = (s?: string) => {
    switch (s) {
      case 'info_waiting': return 'Wacht op info';
      case 'in_progress': return 'In voorbereiding';
      case 'ready': return 'Gereed';
      default: return 'Open';
    }
  };

  const prepStatusColor = (s?: string) => {
    switch (s) {
      case 'info_waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'ready': return 'bg-success/10 text-success border-success/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const renderStatusBadge = (b: EnrichedBooking) => {
    if (b.isPast) {
      return <Badge variant="secondary" className="text-[11px] font-medium bg-muted text-muted-foreground">Afgelopen</Badge>;
    }
    return (
      <Badge variant="secondary" className={cn('text-[11px] font-medium', b.status === 'confirmed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20')}>
        {b.status === 'confirmed' ? 'Reservering' : 'Optie'}
      </Badge>
    );
  };

  const renderTable = (items: EnrichedBooking[], emptyMsg: string) => {
    const allSelected = items.length > 0 && items.every(b => selected.has(b.id));
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => toggleSelectAll(items)}
              />
            </TableHead>
            <TableHead>#</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Voorbereiding</TableHead>
            <TableHead>Contactpersoon</TableHead>
            <TableHead>Bedrijf</TableHead>
            <TableHead>Evenement</TableHead>
            <TableHead>Ruimte</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead>Tijd</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">{emptyMsg}</TableCell>
            </TableRow>
          ) : (
            items.map((b) => (
              <TableRow
                key={b.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  selected.has(b.id) ? 'bg-primary/5' : '',
                  b.isPast ? 'opacity-60 hover:opacity-80 hover:bg-muted/20' : 'hover:bg-muted/30'
                )}
                onClick={() => openEdit(b)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleSelect(b.id)} />
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    <Hash size={12} />{b.reservationNumber || '-'}
                  </span>
                </TableCell>
                <TableCell>{renderStatusBadge(b)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-[11px] font-medium', prepStatusColor(b.preparationStatus))}>
                    {prepStatusLabel(b.preparationStatus)}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{b.contactName}</TableCell>
                <TableCell className="text-muted-foreground">{b.company}</TableCell>
                <TableCell>{b.title}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm"><MapPin size={13} className="text-muted-foreground" />{b.roomName}</span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm"><CalendarIcon size={13} className="text-muted-foreground" />{formatDate(b.date)}</span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm"><Clock size={13} className="text-muted-foreground" />{formatTime(b.startHour, b.startMinute)} – {formatTime(b.endHour, b.endMinute)}</span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(b); }}>
                    <Edit2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  };

  const renderPagination = (currentPage: number, setPage: (p: number) => void, total: number) => {
    const pages = totalPages(total);
    if (total <= pageSize) return null;
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-xs text-muted-foreground">
          {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, total)} van {total}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs text-muted-foreground px-2">{currentPage} / {pages}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Laden...</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reserveringen</h1>
          <p className="text-sm text-muted-foreground">
            {confirmedCount} reserveringen · {optionCount} opties · {past.length} afgelopen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Per pagina:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[20, 50, 100].map((size) => (
              <button key={size} onClick={() => setPageSize(size)} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', pageSize === size ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}>
                {size}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Exporteren als CSV" onClick={() => {
            const allItems = [...upcoming, ...past];
            exportToCSV(allItems.map(b => ({
              nummer: b.reservationNumber || '',
              status: b.status === 'confirmed' ? 'Reservering' : 'Optie',
              voorbereiding: prepStatusLabel(b.preparationStatus),
              contact: b.contactName,
              bedrijf: b.company,
              evenement: b.title,
              ruimte: b.roomName,
              datum: b.date,
              tijd: `${formatTime(b.startHour, b.startMinute)} – ${formatTime(b.endHour, b.endMinute)}`,
              gasten: b.guestCount || '',
            })), [
              { key: 'nummer', label: '#' },
              { key: 'status', label: 'Status' },
              { key: 'voorbereiding', label: 'Voorbereiding' },
              { key: 'contact', label: 'Contactpersoon' },
              { key: 'bedrijf', label: 'Bedrijf' },
              { key: 'evenement', label: 'Evenement' },
              { key: 'ruimte', label: 'Ruimte' },
              { key: 'datum', label: 'Datum' },
              { key: 'tijd', label: 'Tijd' },
              { key: 'gasten', label: 'Gasten' },
            ], 'reserveringen-export');
            toast({ title: `${allItems.length} reserveringen geëxporteerd` });
          }}>
            <Download size={14} />
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        onDelete={handleBulkDelete}
      >
        <Button variant="outline" size="sm" onClick={() => { setBulkEditField({}); setBulkEditOpen(true); }}>
          <Edit2 size={14} className="mr-1" /> Bulk bewerken
        </Button>
      </BulkActionBar>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all">Alles <Badge variant="secondary" className="ml-1.5 text-[10px]">{upcoming.length + past.length}</Badge></TabsTrigger>
            <TabsTrigger value="confirmed">Reserveringen <Badge variant="secondary" className="ml-1.5 text-[10px]">{confirmedCount}</Badge></TabsTrigger>
            <TabsTrigger value="option">Opties <Badge variant="secondary" className="ml-1.5 text-[10px]">{optionCount}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Zoeken..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <CalendarIcon size={18} className="text-primary" />Komende reserveringen
          <Badge variant="secondary" className="text-[10px]">{upcoming.length}</Badge>
        </h2>
        <div className="rounded-xl border bg-card card-shadow overflow-hidden">
          {renderTable(paginate(upcoming, upcomingPage), 'Geen komende reserveringen')}
          {renderPagination(upcomingPage, setUpcomingPage, upcoming.length)}
        </div>
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <History size={18} />Afgelopen
            <Badge variant="secondary" className="text-[10px]">{past.length}</Badge>
          </h2>
          <div className="rounded-xl border bg-card/50 card-shadow overflow-hidden">
            {renderTable(paginate(past, pastPage), 'Geen afgelopen reserveringen')}
            {renderPagination(pastPage, setPastPage, past.length)}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editBooking?.status === 'option' ? 'Optie bewerken' : 'Reservering bewerken'}
              {editBooking?.reservationNumber && (
                <span className="ml-2 text-sm font-mono text-muted-foreground">{editBooking.reservationNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {editBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contactpersoon</Label><Input value={editBooking.contactName} onChange={(e) => setEditBooking({ ...editBooking, contactName: e.target.value })} /></div>
                <div><Label>Evenement</Label><Input value={editBooking.title} onChange={(e) => setEditBooking({ ...editBooking, title: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ruimte</Label>
                  <Select value={editBooking.roomName} onValueChange={(v) => setEditBooking({ ...editBooking, roomName: v as RoomName })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{availableRooms.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editBooking.status} onValueChange={(v) => setEditBooking({ ...editBooking, status: v as 'confirmed' | 'option' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Reservering</SelectItem>
                      <SelectItem value="option">Optie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Datum</Label><Input type="date" value={editBooking.date} onChange={(e) => setEditBooking({ ...editBooking, date: e.target.value })} /></div>
                <div><Label>Van</Label><Input type="time" value={formatTime(editBooking.startHour, editBooking.startMinute)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setEditBooking({ ...editBooking, startHour: h, startMinute: m || 0 }); }} /></div>
                <div><Label>Tot</Label><Input type="time" value={formatTime(editBooking.endHour, editBooking.endMinute)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setEditBooking({ ...editBooking, endHour: h, endMinute: m || 0 }); }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Aantal gasten</Label><Input type="number" min={0} value={editBooking.guestCount || ''} onChange={(e) => setEditBooking({ ...editBooking, guestCount: Math.max(0, Number(e.target.value)) })} /></div>
                <div><Label>Zaalopstelling</Label><Input value={editBooking.roomSetup || ''} onChange={(e) => setEditBooking({ ...editBooking, roomSetup: e.target.value })} placeholder="bijv. U-vorm, Theater" /></div>
              </div>
              <div>
                <Label>Voorbereiding</Label>
                <Select value={editBooking.preparationStatus || 'pending'} onValueChange={(v) => setEditBooking({ ...editBooking, preparationStatus: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Open</SelectItem>
                    <SelectItem value="info_waiting">Wacht op info</SelectItem>
                    <SelectItem value="in_progress">In voorbereiding</SelectItem>
                    <SelectItem value="ready">Gereed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Benodigdheden</Label><Textarea value={editBooking.requirements || ''} onChange={(e) => setEditBooking({ ...editBooking, requirements: e.target.value })} placeholder="Beamer, flipover, koffie/thee, lunch..." rows={3} /></div>
              <div><Label>Notities</Label><Textarea value={editBooking.notes || ''} onChange={(e) => setEditBooking({ ...editBooking, notes: e.target.value })} rows={3} /></div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editBooking?.status === 'option' && (
              <Button variant="outline" onClick={handleConvertToReservation} className="gap-1.5">
                <ArrowRightLeft size={14} /> Omzetten naar reservering
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Annuleren</Button>
              <Button onClick={handleSave}>Opslaan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk bewerken ({selected.size} items)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Selecteer de velden die je wilt wijzigen. Lege velden worden niet aangepast.</p>
            <div>
              <Label>Status</Label>
              <Select value={bulkEditField.status || '_none'} onValueChange={(v) => setBulkEditField({ ...bulkEditField, status: v === '_none' ? undefined : v as any })}>
                <SelectTrigger><SelectValue placeholder="Niet wijzigen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Niet wijzigen</SelectItem>
                  <SelectItem value="confirmed">Reservering</SelectItem>
                  <SelectItem value="option">Optie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Voorbereiding</Label>
              <Select value={bulkEditField.preparationStatus || '_none'} onValueChange={(v) => setBulkEditField({ ...bulkEditField, preparationStatus: v === '_none' ? undefined : v })}>
                <SelectTrigger><SelectValue placeholder="Niet wijzigen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Niet wijzigen</SelectItem>
                  <SelectItem value="pending">Open</SelectItem>
                  <SelectItem value="info_waiting">Wacht op info</SelectItem>
                  <SelectItem value="in_progress">In voorbereiding</SelectItem>
                  <SelectItem value="ready">Gereed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkEditOpen(false)}>Annuleren</Button>
            <Button onClick={() => setBulkEditConfirmOpen(true)} disabled={!bulkEditField.status && !bulkEditField.preparationStatus}>Toepassen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Confirm */}
      <AlertDialog open={bulkEditConfirmOpen} onOpenChange={setBulkEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen bevestigen</AlertDialogTitle>
            <AlertDialogDescription>
              Je past {selected.size} reservering(en) aan. Weet je zeker dat je wilt doorgaan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkEditConfirm}>Bevestigen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
