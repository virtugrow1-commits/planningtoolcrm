import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface ComboboxOption {
  id: string;
  label: string;
  /** Secondary line (e.g. email, company) */
  secondary?: string;
  /** Tertiary info shown faded (e.g. phone) */
  tertiary?: string;
  /** Raw searchable string (built automatically if omitted) */
  searchText?: string;
  /** Optional group heading; a header is rendered when it changes between items */
  group?: string;
}


interface CrmComboboxProps {
  options: ComboboxOption[];
  value: string;
  onSelect: (id: string, option?: ComboboxOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  /** Display label for the currently selected value (if not derivable from options) */
  displayValue?: string;
  className?: string;
  disabled?: boolean;
  /** Max items to render for performance */
  maxResults?: number;
  /** Width of the dropdown */
  popoverWidth?: string;
}

function isValidOption(o: ComboboxOption): boolean {
  if (!o.label) return false;
  const l = o.label.trim();
  if (!l || l === '?' || l === '—' || l === '-' || l === 'null' || l === 'undefined') return false;
  return true;
}

export default function CrmCombobox({
  options,
  value,
  onSelect,
  placeholder = 'Selecteer...',
  searchPlaceholder = 'Zoek...',
  allowClear = false,
  clearLabel = '— Geen —',
  displayValue,
  className,
  disabled = false,
  maxResults = 50,
  popoverWidth = 'w-[320px]',
}: CrmComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Clean options: filter out invalid ones
  const cleanOptions = useMemo(() => options.filter(isValidOption), [options]);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return cleanOptions.slice(0, maxResults);
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return cleanOptions
      .filter((o) => {
        const haystack = (o.searchText || `${o.label} ${o.secondary || ''} ${o.tertiary || ''}`).toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .slice(0, maxResults);
  }, [cleanOptions, search, maxResults]);

  // Total items including clear option
  const totalItems = filtered.length + (allowClear ? 1 : 0);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [filtered.length, search]);

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSearch('');
      setActiveIndex(-1);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = itemRefs.current.get(activeIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleSelect = useCallback((id: string, option?: ComboboxOption) => {
    onSelect(id, option);
    setOpen(false);
    setSearch('');
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) {
          if (allowClear && activeIndex === 0) {
            handleSelect('');
          } else {
            const idx = allowClear ? activeIndex - 1 : activeIndex;
            const opt = filtered[idx];
            if (opt) handleSelect(opt.id, opt);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }, [activeIndex, totalItems, filtered, allowClear, handleSelect]);

  // Resolve display label
  const selectedLabel = useMemo(() => {
    if (displayValue) return displayValue;
    if (!value) return null;
    const opt = cleanOptions.find((o) => o.id === value);
    return opt?.label || null;
  }, [value, displayValue, cleanOptions]);

  const setItemRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(index, el);
    else itemRefs.current.delete(index);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-10 text-sm', className)}
        >
          {selectedLabel ? (
            <span className="truncate">{selectedLabel}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown size={14} className="ml-auto shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(popoverWidth, 'p-0')} align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={searchPlaceholder}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Options list */}
        <div
          ref={listRef}
          role="listbox"
          className="max-h-56 overflow-y-auto p-1"
        >
          {/* Clear option */}
          {allowClear && (
            <button
              ref={(el) => setItemRef(0, el)}
              role="option"
              aria-selected={!value}
              className={cn(
                'w-full text-left text-sm px-3 py-2 rounded-md transition-colors text-muted-foreground',
                activeIndex === 0 && 'bg-accent text-accent-foreground',
                !value && 'font-medium'
              )}
              onClick={() => handleSelect('')}
              onMouseEnter={() => setActiveIndex(0)}
            >
              {clearLabel}
            </button>
          )}

          {/* Filtered options */}
          {filtered.map((opt, i) => {
            const idx = allowClear ? i + 1 : i;
            const isActive = activeIndex === idx;
            const isSelected = value === opt.id;
            return (
              <button
                key={opt.id}
                ref={(el) => setItemRef(idx, el)}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md transition-colors',
                  isActive && 'bg-accent text-accent-foreground',
                  isSelected && !isActive && 'bg-primary/10 text-primary',
                )}
                onClick={() => handleSelect(opt.id, opt)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <span className="text-sm font-medium leading-tight">{opt.label}</span>
                {opt.secondary && (
                  <span className="block text-xs text-muted-foreground mt-0.5 leading-tight">{opt.secondary}</span>
                )}
              </button>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
              {search ? 'Geen resultaten gevonden' : 'Typ om te zoeken...'}
            </p>
          )}

          {/* Hint when list is capped */}
          {filtered.length >= maxResults && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground text-center border-t">
              Typ om meer resultaten te zien
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
