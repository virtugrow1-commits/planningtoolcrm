import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardSectionProps {
  title: string;
  icon: ReactNode;
  count: number;
  viewAllLabel: string;
  viewAllHref: string;
  emptyMessage: string;
  children?: ReactNode;
  isEmpty: boolean;
  headerAction?: ReactNode;
  loading?: boolean;
}

export default function DashboardSection({
  title, icon, count, viewAllLabel, viewAllHref, emptyMessage, children, isEmpty, headerAction, loading,
}: DashboardSectionProps) {
  return (
    <div className="rounded-xl bg-card card-shadow animate-fade-in-up overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3 gap-2">
        <h2 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
          {!loading && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{count}</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {headerAction}
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs gap-1">
            <Link to={viewAllHref}>
              {viewAllLabel}
              <ArrowRight size={12} />
            </Link>
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="divide-y">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-5 py-3 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="divide-y">{children}</div>
      )}
    </div>
  );
}

