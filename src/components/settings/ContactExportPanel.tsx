import { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useGhlTags } from '@/hooks/useGhlTags';
import { exportToCSV } from '@/lib/csvExport';
import { exportToXLSX } from '@/lib/xlsxExport';
import { exportToPDF } from '@/lib/pdfExport';
import { formatDate } from '@/lib/formatters';
import { useToast } from '@/hooks/use-toast';

type ExportFormat = 'xlsx' | 'csv' | 'pdf';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel (.xlsx)',
  csv: 'CSV (.csv)',
  pdf: 'PDF (.pdf)',
};

const FORMAT_BUTTON: Record<ExportFormat, string> = {
  xlsx: 'Exporteren als Excel',
  csv: 'Exporteren als CSV',
  pdf: 'Exporteren als PDF',
};


const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
  do_not_contact: 'Niet benaderen',
};

const COLUMNS: { key: string; label: string; default: boolean }[] = [
  { key: 'firstName', label: 'Voornaam', default: true },
  { key: 'lastName', label: 'Achternaam', default: true },
  { key: 'email', label: 'E-mail', default: true },
  { key: 'phone', label: 'Telefoon', default: true },
  { key: 'company', label: 'Bedrijf', default: true },
  { key: 'jobTitle', label: 'Functie', default: false },
  { key: 'department', label: 'Afdeling', default: false },
  { key: 'dmu', label: 'DMU', default: false },
  { key: 'functionGroup', label: 'Functiegroep', default: false },
  { key: 'address', label: 'Adres', default: false },
  { key: 'postcode', label: 'Postcode', default: false },
  { key: 'city', label: 'Plaats', default: false },
  { key: 'country', label: 'Land', default: false },
  { key: 'birthDate', label: 'Geboortedatum', default: false },
  { key: 'status', label: 'Status', default: true },
  { key: 'tags', label: 'Tags', default: true },
];

const norm = (s: string) => s.trim().toLowerCase();

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function ContactExportPanel() {
  const { contacts, loading } = useContactsContext();
  const { tags: ghlTags } = useGhlTags();
  const { toast } = useToast();

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any');
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [includeDeparted, setIncludeDeparted] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [columns, setColumns] = useState<string[]>(COLUMNS.filter((c) => c.default).map((c) => c.key));

  const companies = useMemo(
    () => [...new Set(contacts.map((c) => c.company).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [contacts]
  );

  const filtered = useMemo(() => {
    const wanted = selectedTags.map(norm);
    return contacts.filter((c) => {
      if (!includeDeparted && c.departed) return false;
      if (status && c.status !== status) return false;
      if (company && c.company !== company) return false;
      if (wanted.length) {
        const own = (c.tags || []).map(norm);
        const ok = tagMode === 'all' ? wanted.every((t) => own.includes(t)) : wanted.some((t) => own.includes(t));
        if (!ok) return false;
      }
      return true;
    });
  }, [contacts, selectedTags, tagMode, status, company, includeDeparted]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const toggleColumn = (key: string) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleExport = () => {
    const cols = COLUMNS.filter((c) => columns.includes(c.key));
    if (!cols.length || !filtered.length) return;

    const rows = filtered.map((c) => {
      const row: Record<string, unknown> = {};
      for (const col of cols) {
        switch (col.key) {
          case 'tags':
            row.tags = (c.tags || []).join('; ');
            break;
          case 'status':
            row.status = STATUS_LABELS[c.status] || c.status;
            break;
          case 'birthDate':
            row.birthDate = c.birthDate ? formatDate(c.birthDate, '') : '';
            break;
          default:
            row[col.key] = (c as unknown as Record<string, unknown>)[col.key] ?? '';
        }
      }
      return row;
    });

    const parts = ['contacten'];
    if (selectedTags.length === 1) parts.push(slug(selectedTags[0]));
    else if (selectedTags.length > 1) parts.push('tags');
    if (status) parts.push(slug(STATUS_LABELS[status] || status));
    parts.push(formatDate(new Date(), '').replace(/-/g, '-'));

    exportToCSV(rows, cols.map((c) => ({ key: c.key, label: c.label })), parts.filter(Boolean).join('-'));
    toast({ title: `${filtered.length} contactpersonen geëxporteerd` });
  };

  const resetFilters = () => {
    setSelectedTags([]);
    setStatus('');
    setCompany('');
    setIncludeDeparted(false);
    setTagMode('any');
  };

  const hasFilters = selectedTags.length > 0 || !!status || !!company || includeDeparted;

  return (
    <div className="rounded-xl border bg-card p-6 card-shadow space-y-6">
      <div>
        <h3 className="font-semibold text-card-foreground">Contactpersonen exporteren</h3>
        <p className="text-xs text-muted-foreground">
          Filter op tag (bijv. "Vrienden aan de Donge"), status of bedrijf en exporteer alleen die selectie als CSV.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Tags</Label>
          <Popover open={tagOpen} onOpenChange={setTagOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                <span className="truncate">
                  {selectedTags.length ? `${selectedTags.length} tag(s) gekozen` : 'Alle tags'}
                </span>
                <Download size={14} className="opacity-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Zoek tag..." />
                <CommandList>
                  <CommandEmpty>Geen tags gevonden</CommandEmpty>
                  <CommandGroup>
                    {ghlTags.map((tag) => (
                      <CommandItem key={tag} value={tag} onSelect={() => toggleTag(tag)} className="gap-2">
                        <Checkbox checked={selectedTags.includes(tag)} className="pointer-events-none" />
                        <span className="truncate">{tag}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleTag(tag)}>
                  {tag} <X size={11} />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tag-combinatie</Label>
          <Select value={tagMode} onValueChange={(v) => setTagMode(v as 'any' | 'all')}>
            <SelectTrigger disabled={selectedTags.length < 2}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Minstens één van de tags</SelectItem>
              <SelectItem value="all">Alle gekozen tags</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status || '_all'} onValueChange={(v) => setStatus(v === '_all' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Alle statussen</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Bedrijf</Label>
          <Select value={company || '_all'} onValueChange={(v) => setCompany(v === '_all' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_all">Alle bedrijven</SelectItem>
              {companies.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Contactpersonen uit dienst meenemen</p>
          <p className="text-xs text-muted-foreground">Standaard uit — vertrokken contactpersonen worden overgeslagen.</p>
        </div>
        <Switch checked={includeDeparted} onCheckedChange={setIncludeDeparted} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Kolommen</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={columns.includes(col.key)} onCheckedChange={() => toggleColumn(col.key)} />
              {col.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {loading
            ? 'Contactpersonen laden…'
            : `${filtered.length} contactpersonen komen overeen${!columns.length ? ' — kies minimaal één kolom' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" onClick={resetFilters}>Filters wissen</Button>
          )}
          <Button onClick={handleExport} disabled={loading || !filtered.length || !columns.length}>
            <Download size={14} className="mr-1.5" /> Exporteren als CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
