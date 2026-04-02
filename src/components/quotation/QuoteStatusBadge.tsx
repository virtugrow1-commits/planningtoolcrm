import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Concept', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Verzonden', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  viewed: { label: 'Bekeken', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  accepted: { label: 'Geaccepteerd', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  declined: { label: 'Afgewezen', className: 'bg-destructive/10 text-destructive' },
  overdue: { label: 'Verlopen', className: 'bg-destructive/10 text-destructive' },
  paid: { label: 'Betaald', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
};

export default function QuoteStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: '' };
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
