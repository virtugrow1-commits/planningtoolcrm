import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export default function KpiCard({ title, value, subtitle, icon, trend, className }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl bg-card p-5 card-shadow transition-shadow hover:card-shadow-hover animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-card-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn('text-xs font-medium', trend.positive ? 'text-success' : 'text-destructive')}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-accent/10 p-2.5 text-accent">{icon}</div>
      </div>
    </div>
  );
}
