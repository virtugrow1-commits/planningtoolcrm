import { mockContacts } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

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
  const [search, setSearch] = useState('');
  const filtered = mockContacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM / Contacten</h1>
          <p className="text-sm text-muted-foreground">{mockContacts.length} contacten</p>
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
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Telefoon</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Bedrijf</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status]}`}>
                    {statusLabels[c.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
