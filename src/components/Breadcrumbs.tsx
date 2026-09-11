import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  /** Optional hint shown when a link in the chain is missing (e.g. option without inquiry). */
  missing?: string | null;
  className?: string;
}

/**
 * Shows the full CRM chain: Bedrijf › Contactpersoon › Aanvraag › Reservering/Taak.
 * Items without a `to` render as plain text (current page or unlinked step).
 */
export default function Breadcrumbs({ items, missing, className }: BreadcrumbsProps) {
  const visible = items.filter((i) => i.label && i.label.trim().length > 0);

  return (
    <div className={cn('space-y-1', className)}>
      <nav aria-label="breadcrumb" className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground">
        {visible.map((item, idx) => {
          const isLast = idx === visible.length - 1;
          return (
            <span key={`${item.label}-${idx}`} className="flex items-center gap-1 min-w-0">
              {idx > 0 && <ChevronRight size={12} className="shrink-0 opacity-50" />}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="truncate max-w-[220px] rounded px-1 -mx-1 hover:text-foreground hover:underline transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('truncate max-w-[260px]', isLast && 'text-foreground font-medium')}>
                  {item.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {missing && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle size={12} className="shrink-0" />
          {missing}
        </p>
      )}
    </div>
  );
}
