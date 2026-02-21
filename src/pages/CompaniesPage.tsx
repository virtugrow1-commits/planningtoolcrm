import { Search, Plus, Pencil, Trash2, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompaniesContext, Company } from '@/contexts/CompaniesContext';

const PAGE_SIZES = [20, 50, 100] as const;

export default function CompaniesPage() {
  const navigate = useNavigate();
  const { companies, loading, addCompany, updateCompany, deleteCompany } = useCompaniesContext();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', website: '', address: '', notes: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const { toast } = useToast();

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  const filtered = companies.filter((c) =>
    `${c.name} ${c.email || ''} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', website: '', address: '', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', website: c.website || '', address: c.address || '', notes: c.notes || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Vul een bedrijfsnaam in', variant: 'destructive' });
      return;
    }
    if (editing) {
      await updateCompany({ ...editing, ...form });
      toast({ title: 'Bedrijf bijgewerkt' });
    } else {
      await addCompany(form);
      toast({ title: 'Bedrijf aangemaakt' });
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCompany(id);
    toast({ title: 'Bedrijf verwijderd' });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Bedrijven laden...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bedrijven</h1>
          <p className="text-sm text-muted-foreground">{companies.length} bedrijven</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Zoeken..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus size={14} className="mr-1" /> Nieuw Bedrijf
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
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Website</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Adres</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground w-24">Acties</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <Building2 size={32} className="mx-auto mb-2 opacity-40" />
                  Geen bedrijven gevonden
                </td>
              </tr>
            )}
            {paginated.map((c) => (
              <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/companies/${c.id}`)}>
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                  {c.website ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{c.website}</a> : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.address || '—'}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Tonen:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span>van {filtered.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="px-2 text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Bedrijf bewerken' : 'Nieuw Bedrijf'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Naam *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefoon</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Adres</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notities</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSave}>{editing ? 'Opslaan' : 'Aanmaken'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
