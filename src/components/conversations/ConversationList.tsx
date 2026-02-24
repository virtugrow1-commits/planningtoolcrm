import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, RefreshCw, MessageSquare, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import BulkActionBar from '@/components/BulkActionBar';

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  lastMessageBody: string;
  lastMessageDate: string;
  lastMessageType: string;
  lastMessageDirection: string;
  unreadCount: number;
  type: string;
  phone?: string;
  email?: string;
}

interface Props {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelect: (conv: Conversation) => void;
  onRefresh: () => void;
  onDelete?: (convId: string) => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
}

export default function ConversationList({
  conversations,
  selectedConv,
  loading,
  searchQuery,
  setSearchQuery,
  onSelect,
  onRefresh,
  onDelete,
  onBulkDelete,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversations.map((c) => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (onBulkDelete) {
      await onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div
      className={cn(
        'w-full md:w-80 border-r flex flex-col shrink-0 bg-card',
        selectedConv && 'hidden md:flex'
      )}
    >
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Gesprekken</h1>
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading} className="h-8 w-8">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek gesprekken..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onRefresh()}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {conversations.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === conversations.length && conversations.length > 0}
              onCheckedChange={toggleAll}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs text-muted-foreground">Alles selecteren</span>
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="p-2 border-b">
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            onDelete={handleBulkDelete}
            deleteLabel="Verwijderen"
          />
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Laden...</div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Geen gesprekken gevonden</div>
        ) : (
          <div className="divide-y">
            {conversations.map((conv) => {
              const isActive = selectedConv?.id === conv.id;
              const isSelected = selectedIds.has(conv.id);
                return (
                <div
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full text-left px-3 py-3 hover:bg-accent/50 transition-colors group flex items-start gap-2 cursor-pointer',
                    isActive && 'bg-accent/50',
                    isSelected && 'bg-accent/30'
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(conv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 h-3.5 w-3.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 rounded-full bg-muted p-1.5 shrink-0">
                        <MessageSquare size={14} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-foreground truncate">
                            {conv.contactName}
                          </span>
                          {conv.lastMessageDate && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {format(new Date(conv.lastMessageDate), 'd MMM', { locale: nl })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.lastMessageDirection === 'outbound' && (
                            <span className="text-foreground/60">Jij: </span>
                          )}
                          {conv.lastMessageBody || 'Geen berichten'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <MessageSquare size={12} className="text-muted-foreground" />
                          {conv.unreadCount > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground ml-auto">
                              {conv.unreadCount}
                            </Badge>
                          )}
                          {onDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
