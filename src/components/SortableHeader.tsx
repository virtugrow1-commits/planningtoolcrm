import { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentDirection: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableHeader({ label, sortKey, currentSort, currentDirection, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-left font-semibold text-muted-foreground hover:text-foreground transition-colors select-none',
        isActive && 'text-foreground',
        className
      )}
    >
      {label}
      {isActive ? (
        currentDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
      ) : (
        <ArrowUpDown size={13} className="opacity-40" />
      )}
    </button>
  );
}

export function useSortState<T>(defaultKey: string | null = null, defaultDir: SortDirection = null) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultDir);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortItems = (items: T[], accessor: (item: T, key: string) => string | number | null | undefined) => {
    if (!sortKey || !sortDir) return items;
    return [...items].sort((a, b) => {
      const aVal = accessor(a, sortKey);
      const bVal = accessor(b, sortKey);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      const cmp = aStr.localeCompare(bStr, 'nl');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  return { sortKey, sortDir, handleSort, sortItems };
}
