import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  draft:     { label: 'Concept',      className: 'bg-muted text-muted-foreground border-border',                 dot: 'bg-muted-foreground/60' },
  sent:      { label: 'Verzonden',    className: 'bg-info/10 text-info border-info/25',                          dot: 'bg-info' },
  viewed:    { label: 'Bekeken',      className: 'bg-accent/15 text-accent-foreground border-accent/30',         dot: 'bg-accent' },
  accepted:  { label: 'Geaccepteerd', className: 'bg-success/10 text-success border-success/25',                 dot: 'bg-success' },
  signed:    { label: 'Getekend',     className: 'bg-success/10 text-success border-success/25',                 dot: 'bg-success' },
  paid:      { label: 'Betaald',      className: 'bg-success/10 text-success border-success/25',                 dot: 'bg-success' },
  declined:  { label: 'Afgewezen',    className: 'bg-destructive/10 text-destructive border-destructive/25',     dot: 'bg-destructive' },
  overdue:   { label: 'Verlopen',     className: 'bg-destructive/10 text-destructive border-destructive/25',     dot: 'bg-destructive' },
};

export default function QuoteStatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = statusConfig[status] || { label: status, className: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/60' };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        cfg.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
