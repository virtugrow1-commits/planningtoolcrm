import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

/**
 * Unified info row for read-only display of a labeled field with optional icon and click action.
 */
export function InfoRow({ icon, label, value, onClick }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">
        {icon} {label}
      </p>
      {onClick ? (
        <button onClick={onClick} className="text-primary hover:underline font-medium text-sm">{value}</button>
      ) : (
        <p className="text-sm text-foreground">{value}</p>
      )}
    </div>
  );
}

/**
 * Unified editable info field — shows read-only value or input when editing.
 */
export function InfoField({ icon, label, value, editing, type, onChange, multiline }: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  editing: boolean;
  type?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">
        {icon} {label}
      </p>
      {editing ? (
        multiline ? (
          <Textarea className="text-sm min-h-[80px]" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input className="h-8 text-sm" type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <p className="text-sm text-foreground">{value || '—'}</p>
      )}
    </div>
  );
}

/**
 * Unified section card used on all detail pages for grouping related content.
 */
export function SectionCard({ title, count, children, actionLabel, onAction, onAdd, linkLabel, onLink }: {
  title: string;
  count?: number;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onAdd?: () => void;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
          {(onAction || onAdd) && (
            <button
              onClick={onAction || onAdd}
              className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={actionLabel || `Nieuwe ${title.toLowerCase()} toevoegen`}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
        {linkLabel && onLink && (
          <button onClick={onLink} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
            {linkLabel} <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
