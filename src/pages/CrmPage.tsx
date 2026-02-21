import { Search, Plus, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useContactsContext } from '@/contexts/ContactsContext';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(/[;,]/).map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function mapRow(row: Record<string, string>): Omit<Contact, 'id' | 'createdAt'> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) { if (row[k]?.trim()) return row[k].trim(); }
    return '';
  };
  const firstName = get('voornaam', 'firstname', 'first_name', 'first name');
  const lastName = get('achternaam', 'lastname', 'last_name', 'last name');
  if (!firstName && !lastName) return null;
  return {
    firstName: firstName || '—',
    lastName: lastName || '—',
    email: get('email', 'e-mail', 'emailadres'),
    phone: get('telefoon', 'phone', 'tel', 'telefoonnummer', 'mobile'),
    company: get('bedrijf', 'company', 'organisatie', 'organization') || undefined,
    status: 'lead',
  };
}

export default function CrmPage() {
  const { contacts, loading, addContact } = useContactsContext();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newContact, setNewContact] = useState<Omit<Contact, 'id' | 'createdAt'>>({ firstName: '', lastName: '', email: '', phone: '', status: 'lead' });
  const [csvPreview, setCsvPreview] = useState<Omit<Contact, 'id' | 'createdAt'>[]>([]);
  const [csvOpen, setCsvOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const mapped = rows.map(mapRow).filter(Boolean) as Omit<Contact, 'id' | 'createdAt'>[];
      if (mapped.length === 0) {
        toast({ title: 'Geen geldige contacten gevonden in CSV', variant: 'destructive' });
        return;
      }
      setCsvPreview(mapped);
      setCsvOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    setImporting(true);
    let count = 0;
    for (const c of csvPreview) {
      try { await addContact(c); count++; } catch { /* skip */ }
    }
    setImporting(false);
    setCsvOpen(false);
    setCsvPreview([]);
    toast({ title: `${count} contacten geïmporteerd` });
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
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={14} className="mr-1" /> CSV Import
          </Button>
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

      {/* CSV Import Preview Dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>CSV Import — {csvPreview.length} contacten gevonden</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 rounded border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Voornaam</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Achternaam</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Telefoon</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bedrijf</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{c.firstName}</td>
                    <td className="px-3 py-1.5">{c.lastName}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.phone || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.company || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvPreview.length > 50 && (
              <p className="text-xs text-muted-foreground p-2">... en {csvPreview.length - 50} meer</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>Annuleren</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importeren...' : `Importeer ${csvPreview.length} contacten`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
