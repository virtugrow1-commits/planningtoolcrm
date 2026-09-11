import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Page title, e.g. "Reserveringen". */
  title: string;
  /** One short line explaining what the page is for. */
  description?: string;
  /** Primary action(s), rendered top right. */
  actions?: ReactNode;
  /** Search + filter row; sticks to the top while scrolling. */
  toolbar?: ReactNode;
  /** Small badges/counters shown next to the title. */
  meta?: ReactNode;
  className?: string;
}

/**
 * Shared page header for every list screen: same title placement, same
 * action placement and a sticky toolbar row for search and filters.
 */
export default function PageHeader({ title, description, actions, toolbar, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {toolbar && (
        <div className="page-toolbar flex flex-wrap items-center gap-2">
          {toolbar}
        </div>
      )}
    </div>
  );
}
