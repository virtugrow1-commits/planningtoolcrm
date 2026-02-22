import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useBookings } from '@/contexts/BookingsContext';
import { useContacts } from '@/hooks/useContacts';
import { useLanguage } from '@/contexts/LanguageContext';
import { Booking, RoomName, ROOMS } from '@/types/crm';
import { Search, Edit2, ArrowRightLeft, Calendar as CalendarIcon, Clock, Users, Building2, User, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ReserveringenPage() {
  const { bookings, updateBooking, loading } = useBookings();
  const { contacts } = useContacts();
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [tab, setTab] = useState<'all' | 'confirmed' | 'option'>('all');

  // Get available rooms
  const availableRooms = useMemo(() => [...ROOMS], []);

  // Enrich bookings with company info from contacts
  const enrichedBookings = useMemo(() => {
    return bookings.map(b => {
      const contact = b.contactId ? contacts.find(c => c.id === b.contactId) : null;
      return {
        ...b,
        company: contact?.company || '-',
      };
    });
  }, [bookings, contacts]);

  // Filter bookings
  const filtered = useMemo(() => {
    let list = enrichedBookings;

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

    // Sort by date ascending
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [enrichedBookings, tab, search]);

  const openEdit = (booking: Booking & { company?: string }) => {
    setEditBooking({ ...booking });
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
    const updated = { ...editBooking, status: 'confirmed' as const };
    await updateBooking(updated);
    setEditOpen(false);
    toast({ title: 'Optie omgezet naar reservering', description: editBooking.title });
  };

  const formatTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return format(d, 'EEE d MMM yyyy', { locale: nl });
    } catch {
      return dateStr;
    }
  };

  const confirmedCount = enrichedBookings.filter(b => b.status === 'confirmed').length;
  const optionCount = enrichedBookings.filter(b => b.status === 'option').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Laden...</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reserveringen</h1>
          <p className="text-sm text-muted-foreground">
            {confirmedCount} reserveringen · {optionCount} opties
          </p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all">
              Alles <Badge variant="secondary" className="ml-1.5 text-[10px]">{enrichedBookings.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              Reserveringen <Badge variant="secondary" className="ml-1.5 text-[10px]">{confirmedCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="option">
              Opties <Badge variant="secondary" className="ml-1.5 text-[10px]">{optionCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card card-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Status</TableHead>
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Geen reserveringen gevonden
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openEdit(b)}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[11px] font-medium',
                        b.status === 'confirmed'
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-warning/10 text-warning border-warning/20'
                      )}
                    >
                      {b.status === 'confirmed' ? 'Reservering' : 'Optie'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{b.contactName}</TableCell>
                  <TableCell className="text-muted-foreground">{(b as any).company}</TableCell>
                  <TableCell>{b.title}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <MapPin size={13} className="text-muted-foreground" />
                      {b.roomName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <CalendarIcon size={13} className="text-muted-foreground" />
                      {formatDate(b.date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <Clock size={13} className="text-muted-foreground" />
                      {formatTime(b.startHour, b.startMinute)} – {formatTime(b.endHour, b.endMinute)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                    >
                      <Edit2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editBooking?.status === 'option' ? 'Optie bewerken' : 'Reservering bewerken'}
            </DialogTitle>
          </DialogHeader>
          {editBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Contactpersoon</Label>
                  <Input
                    value={editBooking.contactName}
                    onChange={(e) => setEditBooking({ ...editBooking, contactName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Evenement</Label>
                  <Input
                    value={editBooking.title}
                    onChange={(e) => setEditBooking({ ...editBooking, title: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ruimte</Label>
                  <Select
                    value={editBooking.roomName}
                    onValueChange={(v) => setEditBooking({ ...editBooking, roomName: v as RoomName })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableRooms.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={editBooking.status}
                    onValueChange={(v) => setEditBooking({ ...editBooking, status: v as 'confirmed' | 'option' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Reservering</SelectItem>
                      <SelectItem value="option">Optie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Datum</Label>
                  <Input
                    type="date"
                    value={editBooking.date}
                    onChange={(e) => setEditBooking({ ...editBooking, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Van</Label>
                  <Input
                    type="time"
                    value={formatTime(editBooking.startHour, editBooking.startMinute)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setEditBooking({ ...editBooking, startHour: h, startMinute: m || 0 });
                    }}
                  />
                </div>
                <div>
                  <Label>Tot</Label>
                  <Input
                    type="time"
                    value={formatTime(editBooking.endHour, editBooking.endMinute)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setEditBooking({ ...editBooking, endHour: h, endMinute: m || 0 });
                    }}
                  />
                </div>
              </div>

              <div>
                <Label>Notities</Label>
                <Textarea
                  value={editBooking.notes || ''}
                  onChange={(e) => setEditBooking({ ...editBooking, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editBooking?.status === 'option' && (
              <Button
                variant="outline"
                onClick={handleConvertToReservation}
                className="gap-1.5"
              >
                <ArrowRightLeft size={14} />
                Omzetten naar reservering
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Annuleren</Button>
              <Button onClick={handleSave}>Opslaan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
