import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
  onClick?: () => void;
}

export default function KpiCard({ title, value, subtitle, icon, trend, className, onClick }: KpiCardProps) {
  return (
    <div
      className={cn(
        'group rounded-xl bg-card p-5 card-shadow transition-all duration-300 ease-spring animate-fade-in',
        'hover:card-shadow-hover hover:-translate-y-0.5',
        onClick && 'cursor-pointer hover:ring-1 hover:ring-primary/15',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-card-foreground tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn('text-xs font-medium', trend.positive ? 'text-success' : 'text-destructive')}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-primary/8 p-3 text-primary transition-colors duration-300 group-hover:bg-primary/12">
          {icon}
        </div>
      </div>
    </div>
  );
}
