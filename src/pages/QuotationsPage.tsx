import { mockQuotations } from '@/data/mockData';
import { FileText, Euro } from 'lucide-react';

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: 'Concept', class: 'bg-muted text-muted-foreground border-border' },
  sent: { label: 'Verzonden', class: 'bg-info/15 text-info border-info/30' },
  accepted: { label: 'Geaccepteerd', class: 'bg-success/15 text-success border-success/30' },
  declined: { label: 'Afgewezen', class: 'bg-destructive/15 text-destructive border-destructive/30' },
  expired: { label: 'Verlopen', class: 'bg-muted text-muted-foreground border-border' },
};

export default function QuotationsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Offertes</h1>
        <p className="text-sm text-muted-foreground">{mockQuotations.length} offertes</p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card card-shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Offerte</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Klant</th>
              <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Bedrag</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Geldig tot</th>
            </tr>
          </thead>
          <tbody>
            {mockQuotations.map((q) => {
              const sc = statusConfig[q.status];
              return (
                <tr key={q.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted-foreground" />
                      <span className="font-medium text-foreground">{q.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.contactName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">€{q.totalAmount.toLocaleString('nl-NL')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${sc.class}`}>{sc.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.validUntil}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail for first quotation */}
      <div className="rounded-xl border bg-card p-5 card-shadow animate-fade-in">
        <h3 className="mb-3 font-semibold text-card-foreground">Detail: {mockQuotations[0].title}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left text-muted-foreground">Omschrijving</th>
              <th className="py-2 text-right text-muted-foreground">Aantal</th>
              <th className="py-2 text-right text-muted-foreground">Prijs/st</th>
              <th className="py-2 text-right text-muted-foreground">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {mockQuotations[0].items.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 text-foreground">{item.description}</td>
                <td className="py-2 text-right text-muted-foreground">{item.quantity}</td>
                <td className="py-2 text-right text-muted-foreground">€{item.unitPrice}</td>
                <td className="py-2 text-right font-medium text-foreground">€{item.total.toLocaleString('nl-NL')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right font-semibold text-foreground">Totaal</td>
              <td className="pt-3 text-right text-lg font-bold text-foreground">€{mockQuotations[0].totalAmount.toLocaleString('nl-NL')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
