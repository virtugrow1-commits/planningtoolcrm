import { mockContacts } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, InboxIcon, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROOMS } from '@/types/crm';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  lead: 'bg-info/15 text-info border-info/30',
  prospect: 'bg-warning/15 text-warning border-warning/30',
  client: 'bg-success/15 text-success border-success/30',
  inactive: 'bg-muted text-muted-foreground border-border',
};

const statusLabels: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
};

export default function CrmPage() {
  const [contacts, setContacts] = useState(mockContacts);
  const [search, setSearch] = useState('');
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', roomPreference: '' });
  
  // Edit contact state
  const [editOpen, setEditOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const filtered = contacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const openEditDialog = (contact: Contact) => {
    setEditContact({ ...contact });
    setEditOpen(true);
  };

  const handleSaveContact = () => {
    if (!editContact) return;
    if (!editContact.firstName || !editContact.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    setContacts((prev) => prev.map((c) => c.id === editContact.id ? editContact : c));
    setEditOpen(false);
    toast({ title: 'Contact bijgewerkt' });
  };

  const handleDeleteContact = () => {
    if (!editContact) return;
    setContacts((prev) => prev.filter((c) => c.id !== editContact.id));
    setEditOpen(false);
    toast({ title: 'Contact verwijderd', description: `${editContact.firstName} ${editContact.lastName}` });
  };

  const openInquiryForContact = (contact: Contact) => {
    setSelectedContact({ id: contact.id, name: `${contact.firstName} ${contact.lastName}` });
    setForm({ eventType: '', preferredDate: '', guestCount: '', budget: '', message: '', roomPreference: '' });
    setInquiryOpen(true);
  };

  const handleSubmitInquiry = () => {
    if (!form.eventType || !selectedContact) {
      toast({ title: 'Vul minimaal een type evenement in', variant: 'destructive' });
      return;
    }
    const params = new URLSearchParams({
      contactId: selectedContact.id,
      contactName: selectedContact.name,
      eventType: form.eventType,
      preferredDate: form.preferredDate,
      guestCount: form.guestCount,
      budget: form.budget,
      message: form.message,
      roomPreference: form.roomPreference,
    });
    setInquiryOpen(false);
    navigate(`/inquiries?newInquiry=${encodeURIComponent(params.toString())}`);
  };

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM / Contacten</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacten · Klik op een rij om te bewerken</p>
        </div>
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Zoeken..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Naam</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Telefoon</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Bedrijf</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Acties</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => openEditDialog(c)} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status]}`}>
                    {statusLabels[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={(e) => { e.stopPropagation(); openInquiryForContact(c); }}
                  >
                    <InboxIcon size={12} className="mr-1" /> Aanvraag
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Contact Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact Bewerken</DialogTitle>
          </DialogHeader>
          {editContact && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Voornaam *</Label>
                  <Input value={editContact.firstName} onChange={(e) => setEditContact({ ...editContact, firstName: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Achternaam *</Label>
                  <Input value={editContact.lastName} onChange={(e) => setEditContact({ ...editContact, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={editContact.email} onChange={(e) => setEditContact({ ...editContact, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefoon</Label>
                <Input value={editContact.phone} onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Bedrijf</Label>
                <Input value={editContact.company || ''} onChange={(e) => setEditContact({ ...editContact, company: e.target.value || undefined })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={editContact.status} onValueChange={(v: Contact['status']) => setEditContact({ ...editContact, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="client">Klant</SelectItem>
                    <SelectItem value="inactive">Inactief</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Notities</Label>
                <Textarea value={editContact.notes || ''} onChange={(e) => setEditContact({ ...editContact, notes: e.target.value || undefined })} placeholder="Eventuele notities..." />
              </div>
            </div>
          )}
          <DialogFooter className="flex !justify-between">
            <Button variant="destructive" size="sm" onClick={handleDeleteContact}>
              Verwijderen
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuleren</Button>
              <Button onClick={handleSaveContact}>Opslaan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Inquiry from Contact Dialog */}
      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aanvraag indienen</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="grid gap-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{selectedContact.name}</p>
                <p className="text-xs text-muted-foreground">Contact gekoppeld aan deze aanvraag</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Type evenement *</Label>
                <Input placeholder="Bijv. Vergadering, Bruiloft, Workshop" value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Voorkeursdatum</Label>
                  <Input type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Aantal gasten</Label>
                  <Input type="number" min="1" placeholder="0" value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Ruimte voorkeur</Label>
                  <Select value={form.roomPreference} onValueChange={(v) => setForm({ ...form, roomPreference: v })}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Optioneel" /></SelectTrigger>
                    <SelectContent>
                      {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Budget (€)</Label>
                  <Input type="number" min="0" placeholder="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Bericht / Notities</Label>
                <Textarea placeholder="Omschrijving van de aanvraag..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInquiryOpen(false)}>Annuleren</Button>
            <Button onClick={handleSubmitInquiry}>
              <InboxIcon size={14} className="mr-1" /> Aanvraag Indienen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
