// Shared data-loading helpers: parallel paged fetches + debounced refetch.
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/** Keeps supabase-js from parsing select strings at the type level (huge tsc cost). */
const sel = (s: string): string => s;

interface FetchAllOptions {
  table: string;
  columns: string;
  orderBy: string;
  ascending?: boolean;
  /** Optional PostgREST `or` filter applied to every page. */
  or?: string;
}

/**
 * Fetches every row of a table. The first page is requested with an exact count,
 * the remaining pages are then fetched in parallel instead of one-by-one.
 */
export async function fetchAllRows(
  opts: FetchAllOptions,
): Promise<{ rows: any[]; error: { message: string } | null }> {
  const client = supabase as any;

  const base = () => {
    let q = client
      .from(opts.table)
      .select(sel(opts.columns), { count: 'exact' })
      .order(opts.orderBy, { ascending: opts.ascending ?? true });
    if (opts.or) q = q.or(opts.or);
    return q;
  };

  const first = await base().range(0, PAGE_SIZE - 1);
  if (first.error) return { rows: [], error: first.error };

  const rows: any[] = first.data ?? [];
  const total: number = first.count ?? rows.length;

  if (total > PAGE_SIZE) {
    const ranges: number[] = [];
    for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) ranges.push(from);

    const pages = await Promise.all(
      ranges.map((from) => base().range(from, from + PAGE_SIZE - 1)),
    );
    for (const p of pages) {
      if (p.error) return { rows: [], error: p.error };
      if (p.data) rows.push(...p.data);
    }
  }

  return { rows, error: null };
}

/** Trailing debounce, used to collapse realtime bursts into a single refetch. */
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); };
  return wrapped as T & { cancel: () => void };
}
