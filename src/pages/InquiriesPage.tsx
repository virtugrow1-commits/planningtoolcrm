import { mockInquiries } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, Euro } from 'lucide-react';

const statusConfig: Record<string, { label: string; class: string }> = {
  new: { label: 'Nieuw', class: 'bg-info/15 text-info border-info/30' },
  contacted: { label: 'Gecontacteerd', class: 'bg-warning/15 text-warning border-warning/30' },
  quoted: { label: 'Offerte verstuurd', class: 'bg-accent/15 text-accent border-accent/30' },
  converted: { label: 'Geconverteerd', class: 'bg-success/15 text-success border-success/30' },
  lost: { label: 'Verloren', class: 'bg-muted text-muted-foreground border-border' },
};

export default function InquiriesPage() {
  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Aanvragen</h1>
        <p className="text-sm text-muted-foreground">{mockInquiries.length} aanvragen</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mockInquiries.map((inq) => {
          const sc = statusConfig[inq.status];
          return (
            <div key={inq.id} className="rounded-xl border bg-card p-5 card-shadow animate-fade-in hover:card-shadow-hover transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-card-foreground">{inq.eventType}</h3>
                  <p className="text-sm text-muted-foreground">{inq.contactName}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${sc.class}`}>{sc.label}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{inq.message}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar size={12} /> {inq.preferredDate}</span>
                <span className="flex items-center gap-1"><Users size={12} /> {inq.guestCount} gasten</span>
                {inq.budget && <span className="flex items-center gap-1"><Euro size={12} /> €{inq.budget.toLocaleString('nl-NL')}</span>}
                {inq.roomPreference && <span>· {inq.roomPreference}</span>}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground/60">Bron: {inq.source} · {inq.createdAt}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
