import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useContactsContext } from '@/contexts/ContactsContext';

export default function CrmPage() {
  const { contacts, loading, addContact } = useContactsContext();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newContact, setNewContact] = useState<Omit<Contact, 'id' | 'createdAt'>>({ firstName: '', lastName: '', email: '', phone: '', status: 'lead' });
  const navigate = useNavigate();
  const { toast } = useToast();

  const filtered = contacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddContact = async () => {
    if (!newContact.firstName || !newContact.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    await addContact(newContact);
    setNewOpen(false);
    setNewContact({ firstName: '', lastName: '', email: '', phone: '', status: 'lead' });
    toast({ title: 'Contact aangemaakt' });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Contacten laden...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM / Contacten</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacten</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Zoeken..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={14} className="mr-1" /> Nieuw Contact
          </Button>
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/crm/${c.id}`)} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Contact Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuw Contact</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Voornaam *</Label>
                <Input value={newContact.firstName} onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Achternaam *</Label>
                <Input value={newContact.lastName} onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefoon</Label>
              <Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bedrijf</Label>
              <Input value={newContact.company || ''} onChange={(e) => setNewContact({ ...newContact, company: e.target.value || undefined })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddContact}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}