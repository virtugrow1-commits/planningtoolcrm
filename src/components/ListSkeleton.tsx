import { cn } from '@/lib/utils';

/**
 * Placeholder rows shown while a list is loading, so the page keeps its
 * shape instead of flashing a single "Laden..." line.
 */
export default function ListSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden card-shadow', className)}>
      <div className="h-11 bg-muted/50 border-b" />
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
            <div className="h-3.5 flex-1 max-w-[180px] rounded bg-muted animate-pulse" />
            <div className="h-3.5 flex-1 max-w-[220px] rounded bg-muted animate-pulse hidden md:block" />
            <div className="h-3.5 w-24 rounded bg-muted animate-pulse hidden lg:block" />
            <div className="h-5 w-16 rounded-full bg-muted animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
