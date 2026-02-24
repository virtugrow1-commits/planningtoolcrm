import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw,
  MessageSquare,
  ArrowLeft,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ConversationList from '@/components/conversations/ConversationList';
import ContactDetailsPanel from '@/components/conversations/ContactDetailsPanel';
import MessageComposer from '@/components/conversations/MessageComposer';

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
  ghlConversationId?: string;
}

interface Message {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
  dateAdded: string;
  type: string;
  status?: string;
  contentType?: string;
  attachments?: string[];
}

export default function ConversationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations from database
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .order('last_message_date', { ascending: false, nullsFirst: false });

      if (searchQuery) {
        query = query.ilike('contact_name', `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setConversations((data || []).map((c: any) => ({
        id: c.id,
        contactId: c.contact_id || c.ghl_conversation_id || '',
        contactName: c.contact_name,
        lastMessageBody: c.last_message_body || '',
        lastMessageDate: c.last_message_date || c.updated_at,
        lastMessageType: c.channel || 'chat',
        lastMessageDirection: c.last_message_direction || 'inbound',
        unreadCount: c.unread ? 1 : 0,
        type: c.channel || 'chat',
        phone: c.phone,
        email: c.email,
        ghlConversationId: c.ghl_conversation_id,
      })));
    } catch (err: any) {
      toast({ title: 'Fout bij laden gesprekken', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery, toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription for new conversations/messages
  useEffect(() => {
    const channel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        // If this message belongs to the selected conversation, add it
        if (selectedConv && payload.new && (payload.new as any).conversation_id === selectedConv.id) {
          const msg = payload.new as any;
          setMessages((prev) => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              body: msg.body || '',
              direction: msg.direction as 'inbound' | 'outbound',
              dateAdded: msg.date_added || msg.created_at,
              type: msg.message_type || 'TYPE_SMS',
              status: msg.status,
            }];
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  // Fetch messages from database
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('date_added', { ascending: true });

      if (error) throw error;

      setMessages((data || []).map((m: any) => ({
        id: m.id,
        body: m.body || '',
        direction: m.direction as 'inbound' | 'outbound',
        dateAdded: m.date_added || m.created_at,
        type: m.message_type || 'TYPE_SMS',
        status: m.status,
      })));

      // Mark conversation as read
      await supabase.from('conversations').update({ unread: false }).eq('id', conversationId);
    } catch (err: any) {
      toast({ title: 'Fout bij laden berichten', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingMessages(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
    }
  }, [selectedConv, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (message: string, channel: string, options?: { subject?: string; cc?: string; bcc?: string }) => {
    if (!selectedConv) return;
    try {
      // Send via GHL if we have a GHL conversation ID
      const ghlConvId = selectedConv.ghlConversationId || selectedConv.id;
      const { data, error } = await supabase.functions.invoke('ghl-sync', {
        body: {
          action: 'send-message',
          conversationId: ghlConvId,
          contactId: selectedConv.contactId,
          message,
          type: 'Email',
          subject: options?.subject || undefined,
          cc: options?.cc || undefined,
          bcc: options?.bcc || undefined,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Verzenden mislukt');

      // Also save to local database
      const newMsg = {
        user_id: user!.id,
        conversation_id: selectedConv.id,
        ghl_message_id: data.messageId || null,
        body: message,
        direction: 'outbound',
        message_type: 'Email',
        status: 'sent',
        date_added: new Date().toISOString(),
      };
      await supabase.from('messages').insert(newMsg);

      // Update conversation
      await supabase.from('conversations').update({
        last_message_body: message,
        last_message_date: new Date().toISOString(),
        last_message_direction: 'outbound',
      }).eq('id', selectedConv.id);

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId || `local-${Date.now()}`,
          body: message,
          direction: 'outbound',
          dateAdded: new Date().toISOString(),
          type: 'Email',
          status: 'sent',
        },
      ]);
    } catch (err: any) {
      toast({ title: 'Fout bij verzenden', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      // Delete from GHL too
      const conv = conversations.find(c => c.id === convId);
      if (conv?.ghlConversationId) {
        await supabase.functions.invoke('ghl-sync', {
          body: { action: 'delete-conversation', conversationId: conv.ghlConversationId },
        });
      }
      // Delete from local DB (cascade deletes messages)
      await supabase.from('conversations').delete().eq('id', convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (selectedConv?.id === convId) {
        setSelectedConv(null);
        setMessages([]);
      }
      toast({ title: 'Gesprek verwijderd' });
    } catch (err: any) {
      toast({ title: 'Fout bij verwijderen', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    for (const id of ids) {
      try {
        const conv = conversations.find(c => c.id === id);
        if (conv?.ghlConversationId) {
          await supabase.functions.invoke('ghl-sync', { body: { action: 'delete-conversation', conversationId: conv.ghlConversationId } });
        }
        await supabase.from('conversations').delete().eq('id', id);
      } catch {}
    }
    setConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
    if (selectedConv && ids.includes(selectedConv.id)) {
      setSelectedConv(null);
      setMessages([]);
    }
    toast({ title: `${ids.length} gesprek${ids.length !== 1 ? 'ken' : ''} verwijderd` });
  };

  // Force sync from GHL (manual refresh)
  const handleRefresh = async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke('ghl-auto-sync');
      await fetchConversations();
      toast({ title: 'Gesprekken gesynchroniseerd' });
    } catch (err: any) {
      toast({ title: 'Sync mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <ConversationList
        conversations={conversations}
        selectedConv={selectedConv}
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSelect={setSelectedConv}
        onRefresh={handleRefresh}
        onDelete={handleDeleteConversation}
        onBulkDelete={handleBulkDelete}
      />

      {/* Message Thread */}
      <div className={cn('flex-1 flex flex-col min-w-0', !selectedConv && 'hidden md:flex')}>
        {selectedConv ? (
          <>
            <div className="px-4 py-3 border-b flex items-center gap-3 bg-card">
              <button onClick={() => setSelectedConv(null)} className="md:hidden text-muted-foreground hover:text-foreground">
                <ArrowLeft size={18} />
              </button>
              <div className="rounded-full bg-muted p-2">
                <User size={16} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm text-foreground truncate">{selectedConv.contactName}</h2>
                <p className="text-xs text-muted-foreground">{selectedConv.phone || selectedConv.email || selectedConv.type}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => fetchMessages(selectedConv.id)} disabled={loadingMessages} className="h-8 w-8">
                <RefreshCw size={14} className={loadingMessages ? 'animate-spin' : ''} />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="text-center text-sm text-muted-foreground py-8">Berichten laden...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Geen berichten in dit gesprek</div>
              ) : (
                <div className="space-y-3 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted text-foreground rounded-bl-md'
                      )}>
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p className={cn('text-[10px] mt-1', msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                          {format(new Date(msg.dateAdded), 'd MMM HH:mm', { locale: nl })}
                          {msg.status && msg.direction === 'outbound' && (
                            <span className="ml-1.5">{msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : ''}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <MessageComposer onSend={handleSendMessage} sending={false} conversationType={selectedConv.type} contactPhone={selectedConv.phone} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare size={40} className="mx-auto opacity-30" />
              <p className="text-sm">Selecteer een gesprek om berichten te bekijken</p>
            </div>
          </div>
        )}
      </div>

      {selectedConv && (
        <ContactDetailsPanel
          contactId={selectedConv.contactId}
          contactName={selectedConv.contactName}
          phone={selectedConv.phone}
          email={selectedConv.email}
        />
      )}
    </div>
  );
}
