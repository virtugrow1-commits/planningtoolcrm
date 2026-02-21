import { Search, Plus, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
};

type FilterKey = 'status' | 'company';

const PAGE_SIZES = [20, 50, 100] as const;

export default function CrmPage() {
  const { contacts, loading, addContact } = useContactsContext();
  const { companies } = useCompaniesContext();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newContact, setNewContact] = useState<Omit<Contact, 'id' | 'createdAt'>>({ firstName: '', lastName: '', email: '', phone: '', status: 'lead' });
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ status: '', company: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Unique values for filter dropdowns
  const uniqueStatuses = [...new Set(contacts.map((c) => c.status))];
  const uniqueCompanies = [...new Set(contacts.map((c) => c.company).filter(Boolean))] as string[];

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = contacts.filter((c) => {
    const matchesSearch = `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filters.status || c.status === filters.status;
    const matchesCompany = !filters.company || c.company === filters.company;
    return matchesSearch && matchesStatus && matchesCompany;
  });

  const clearFilters = () => { setFilters({ status: '', company: '' }); setPage(1); };

  // Reset page on search/filter change
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleFilter = (f: Record<FilterKey, string>) => { setFilters(f); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleAddContact = async () => {
    if (!newContact.firstName || !newContact.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    // Auto-link company_id if company name matches an existing company
    let companyId: string | undefined;
    if (newContact.company) {
      const match = companies.find((c) => c.name.toLowerCase() === newContact.company!.toLowerCase());
      if (match) companyId = match.id;
    }
    await addContact({ ...newContact, companyId });
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
          <p className="text-sm text-muted-foreground">{filtered.length} van {contacts.length} contacten</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Zoeken..." className="pl-9" value={search} onChange={(e) => handleSearch(e.target.value)} />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="relative">
                <Filter size={14} className="mr-1" /> Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">{activeFilterCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>
                    <X size={12} className="mr-1" /> Wissen
                  </Button>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Status</Label>
                 <Select value={filters.status} onValueChange={(v) => handleFilter({ ...filters, status: v === '_all' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Alle statussen" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle statussen</SelectItem>
                    {uniqueStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Bedrijf</Label>
                 <Select value={filters.company} onValueChange={(v) => handleFilter({ ...filters, company: v === '_all' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Alle bedrijven" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle bedrijven</SelectItem>
                    {uniqueCompanies.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={14} className="mr-1" /> Nieuw Contact
          </Button>
        </div>
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.status && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => handleFilter({ ...filters, status: '' })}>
              Status: {STATUS_LABELS[filters.status] || filters.status} <X size={12} />
            </Badge>
          )}
          {filters.company && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => handleFilter({ ...filters, company: '' })}>
              Bedrijf: {filters.company} <X size={12} />
            </Badge>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Naam</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Telefoon</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Bedrijf</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Geen contacten gevonden</td>
              </tr>
            )}
            {paginated.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/crm/${c.id}`)} className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <Badge variant="outline" className="text-xs">{STATUS_LABELS[c.status] || c.status}</Badge>
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
