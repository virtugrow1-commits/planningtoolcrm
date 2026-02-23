import { Search, Plus, Filter, X, ChevronLeft, ChevronRight, Edit2, Trash2, Download, Building2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BulkActionBar from '@/components/BulkActionBar';
import { Contact } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/csvExport';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
  do_not_contact: 'Niet benaderen',
};

type FilterKey = 'status' | 'company';
type CrmTab = 'contacts' | 'companies';
const PAGE_SIZES = [20, 50, 100] as const;

export default function CrmPage() {
  const { contacts, loading, addContact, deleteContact, updateContact } = useContactsContext();
  const { companies, loading: companiesLoading, deleteCompany, updateCompany } = useCompaniesContext();
  const [activeTab, setActiveTab] = useState<CrmTab>('contacts');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newContact, setNewContact] = useState<Omit<Contact, 'id' | 'createdAt'>>({ firstName: '', lastName: '', email: '', phone: '', status: 'lead' });
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ status: '', company: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditStatus, setBulkEditStatus] = useState('');
  const [bulkEditConfirmOpen, setBulkEditConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const uniqueStatuses = [...new Set(contacts.map((c) => c.status))];
  const uniqueCompanies = [...new Set(contacts.map((c) => c.company).filter(Boolean))] as string[];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = contacts.filter((c) => {
    const searchLower = search.toLowerCase().trim();
    const contactText = `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase();
    const searchTerms = searchLower.split(/\s+/).filter(Boolean);
    const matchesSearch = !searchLower || searchTerms.every((term) => contactText.includes(term));
    const matchesStatus = !filters.status || c.status === filters.status;
    const matchesCompany = !filters.company || c.company === filters.company;
    return matchesSearch && matchesStatus && matchesCompany;
  });

  const clearFilters = () => { setFilters({ status: '', company: '' }); setPage(1); };
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleFilter = (f: Record<FilterKey, string>) => { setFilters(f); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleSelectAll = () => {
    const ids = paginated.map(c => c.id);
    const allSel = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id));
      return n;
    });
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    for (const id of selected) await deleteContact(id);
    setSelected(new Set());
    toast({ title: `${count} contact(en) verwijderd` });
  };

  const handleBulkEditConfirm = async () => {
    if (!bulkEditStatus) return;
    const count = selected.size;
    for (const id of selected) {
      const c = contacts.find(x => x.id === id);
      if (c) await updateContact({ ...c, status: bulkEditStatus as Contact['status'] });
    }
    setSelected(new Set());
    setBulkEditOpen(false);
    setBulkEditConfirmOpen(false);
    setBulkEditStatus('');
    toast({ title: `${count} contact(en) bijgewerkt` });
  };

  const handleAddContact = async () => {
    if (!newContact.firstName || !newContact.lastName) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
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

  // Companies tab filtering
  const filteredCompanies = companies.filter((c) =>
    `${c.name} ${c.email || ''} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(search.toLowerCase())
  );
  const companyTotalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const paginatedCompanies = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

  const handleExportContacts = () => {
    exportToCSV(filtered.map(c => ({
      id: c.displayNumber || '',
      naam: `${c.firstName} ${c.lastName}`,
      email: c.email,
      telefoon: c.phone,
      bedrijf: c.company || '',
      status: STATUS_LABELS[c.status] || c.status,
      aangemaakt: c.createdAt,
    })), [
      { key: 'id', label: 'ID' },
      { key: 'naam', label: 'Naam' },
      { key: 'email', label: 'Email' },
      { key: 'telefoon', label: 'Telefoon' },
      { key: 'bedrijf', label: 'Bedrijf' },
      { key: 'status', label: 'Status' },
      { key: 'aangemaakt', label: 'Aangemaakt' },
    ], 'contacten-export');
    toast({ title: `${filtered.length} contacten geëxporteerd` });
  };

  const handleExportCompanies = () => {
    exportToCSV(filteredCompanies.map(c => ({
      id: c.displayNumber || '',
      naam: c.name,
      email: c.email || '',
      telefoon: c.phone || '',
      website: c.website || '',
      adres: c.address || '',
    })), [
      { key: 'id', label: 'ID' },
      { key: 'naam', label: 'Naam' },
      { key: 'email', label: 'Email' },
      { key: 'telefoon', label: 'Telefoon' },
      { key: 'website', label: 'Website' },
      { key: 'adres', label: 'Adres' },
    ], 'bedrijven-export');
    toast({ title: `${filteredCompanies.length} bedrijven geëxporteerd` });
  };

  if (loading || companiesLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="text-muted-foreground">Laden...</div></div>;
  }

  const allPageSelected = activeTab === 'contacts'
    ? paginated.length > 0 && paginated.every(c => selected.has(c.id))
    : paginatedCompanies.length > 0 && paginatedCompanies.every(c => selected.has(c.id));

  const currentTotalPages = activeTab === 'contacts' ? totalPages : companyTotalPages;
  const currentTotal = activeTab === 'contacts' ? filtered.length : filteredCompanies.length;

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'contacts' ? `${filtered.length} van ${contacts.length} contacten` : `${filteredCompanies.length} van ${companies.length} bedrijven`}
          </p>
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
                {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">{activeFilterCount}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}><X size={12} className="mr-1" /> Wissen</Button>}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={filters.status} onValueChange={(v) => handleFilter({ ...filters, status: v === '_all' ? '' : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle statussen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle statussen</SelectItem>
                    {uniqueStatuses.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Bedrijf</Label>
                <Select value={filters.company} onValueChange={(v) => handleFilter({ ...filters, company: v === '_all' ? '' : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle bedrijven" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle bedrijven</SelectItem>
                    {uniqueCompanies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} className="mr-1" /> {activeTab === 'contacts' ? 'Nieuw Contact' : 'Nieuw Bedrijf'}</Button>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.status && <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => handleFilter({ ...filters, status: '' })}>Status: {STATUS_LABELS[filters.status] || filters.status} <X size={12} /></Badge>}
          {filters.company && <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => handleFilter({ ...filters, company: '' })}>Bedrijf: {filters.company} <X size={12} /></Badge>}
        </div>
      )}

      {/* Tab toggle */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as CrmTab); setPage(1); setSelected(new Set()); setSearch(''); setFilters({ status: '', company: '' }); }}>
        <TabsList>
          <TabsTrigger value="contacts" className="gap-1.5"><Users size={14} /> Contactpersonen</TabsTrigger>
          <TabsTrigger value="companies" className="gap-1.5"><Building2 size={14} /> Bedrijven</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'contacts' && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())} onDelete={handleBulkDelete}>
          <Button variant="outline" size="sm" onClick={() => { setBulkEditStatus(''); setBulkEditOpen(true); }}>
            <Edit2 size={14} className="mr-1" /> Bulk status wijzigen
          </Button>
        </BulkActionBar>
      )}

      {activeTab === 'contacts' ? (
      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 w-[40px]"><Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} /></th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[110px]">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Naam</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Telefoon</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Bedrijf</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Geen contacten gevonden</td></tr>
            )}
            {paginated.map((c) => (
              <tr
                key={c.id}
                className={cn('border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer', selected.has(c.id) ? 'bg-primary/5' : '')}
                onClick={() => navigate(`/crm/${c.id}`)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{c.displayNumber || '—'}</td>
                <td className="px-4 py-3 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.company || '—'}</td>
                <td className="px-4 py-3 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                  <Select value={c.status} onValueChange={async (v) => { await updateContact({ ...c, status: v as Contact['status'] }); toast({ title: 'Status bijgewerkt' }); }}>
                    <SelectTrigger className={cn('h-7 w-[140px] text-xs border-0 bg-transparent hover:bg-muted/50', c.status === 'do_not_contact' && 'text-destructive')}>
                      <SelectValue>{STATUS_LABELS[c.status] || c.status}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="client">Klant</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                      <SelectItem value="do_not_contact">Niet benaderen</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 w-[40px]"><Checkbox checked={allPageSelected} onCheckedChange={() => {
                const ids = paginatedCompanies.map(c => c.id);
                const allSel = ids.every(id => selected.has(id));
                setSelected(prev => { const n = new Set(prev); if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; });
              }} /></th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[110px]">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Naam</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden md:table-cell">Telefoon</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Plaats</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCompanies.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Building2 size={32} className="mx-auto mb-2 opacity-40" />Geen bedrijven gevonden</td></tr>
            )}
            {paginatedCompanies.map((c) => (
              <tr
                key={c.id}
                className={cn('border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer', selected.has(c.id) ? 'bg-primary/5' : '')}
                onClick={() => navigate(`/companies/${c.id}`)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{c.displayNumber || '—'}</td>
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.city || '—'}</td>
                <td className="px-4 py-3 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                  <Select value={c.crmGroup || 'lead'} onValueChange={async (v) => { await updateCompany({ ...c, crmGroup: v }); toast({ title: 'Status bijgewerkt' }); }}>
                    <SelectTrigger className="h-7 w-[140px] text-xs border-0 bg-transparent hover:bg-muted/50">
                      <SelectValue>{STATUS_LABELS[c.crmGroup || 'lead'] || c.crmGroup || 'Lead'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="client">Klant</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                      <SelectItem value="do_not_contact">Niet benaderen</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Tonen:</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <span>van {currentTotal}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={activeTab === 'contacts' ? handleExportContacts : handleExportCompanies} title="Exporteren als CSV">
            <Download size={14} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
          <span className="px-2 text-sm text-muted-foreground">{page} / {currentTotalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= currentTotalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
        </div>
      </div>

      {/* New Contact Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nieuw Contact</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Voornaam *</Label><Input value={newContact.firstName} onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Achternaam *</Label><Input value={newContact.lastName} onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Telefoon</Label><Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Bedrijf</Label><Input value={newContact.company || ''} onChange={(e) => setNewContact({ ...newContact, company: e.target.value || undefined })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddContact}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Bulk status wijzigen ({selected.size} contacten)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nieuwe status</Label>
              <Select value={bulkEditStatus} onValueChange={setBulkEditStatus}>
                <SelectTrigger><SelectValue placeholder="Selecteer status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="client">Klant</SelectItem>
                  <SelectItem value="inactive">Inactief</SelectItem>
                  <SelectItem value="do_not_contact">Niet benaderen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkEditOpen(false)}>Annuleren</Button>
            <Button onClick={() => setBulkEditConfirmOpen(true)} disabled={!bulkEditStatus}>Toepassen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkEditConfirmOpen} onOpenChange={setBulkEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen bevestigen</AlertDialogTitle>
            <AlertDialogDescription>Je past de status van {selected.size} contact(en) aan naar "{STATUS_LABELS[bulkEditStatus] || bulkEditStatus}". Weet je zeker dat je wilt doorgaan?</AlertDialogDescription>
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
