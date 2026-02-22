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

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-sync', {
        body: { action: 'get-conversations', query: searchQuery || undefined },
      });
      if (error) throw error;
      setConversations(data.conversations || []);
    } catch (err: any) {
      toast({ title: 'Fout bij laden gesprekken', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery, toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-sync', {
        body: { action: 'get-messages', conversationId },
      });
      if (error) throw error;
      setMessages((data.messages || []).reverse());
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

  const handleSendMessage = async (message: string, channel: string, subject?: string) => {
    if (!selectedConv) return;
    try {
      const { data, error } = await supabase.functions.invoke('ghl-sync', {
        body: {
          action: 'send-message',
          conversationId: selectedConv.id,
          contactId: selectedConv.contactId,
          message,
          type: 'Email',
          subject: subject || undefined,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Verzenden mislukt');

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

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation List */}
      <ConversationList
        conversations={conversations}
        selectedConv={selectedConv}
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSelect={setSelectedConv}
        onRefresh={fetchConversations}
      />

      {/* Message Thread */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0',
          !selectedConv && 'hidden md:flex'
        )}
      >
        {selectedConv ? (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b flex items-center gap-3 bg-card">
              <button
                onClick={() => setSelectedConv(null)}
                className="md:hidden text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="rounded-full bg-muted p-2">
                <User size={16} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm text-foreground truncate">
                  {selectedConv.contactName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedConv.phone || selectedConv.email || selectedConv.type}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchMessages(selectedConv.id)}
                disabled={loadingMessages}
                className="h-8 w-8"
              >
                <RefreshCw size={14} className={loadingMessages ? 'animate-spin' : ''} />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Berichten laden...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Geen berichten in dit gesprek
                </div>
              ) : (
                <div className="space-y-3 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                          msg.direction === 'outbound'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p
                          className={cn(
                            'text-[10px] mt-1',
                            msg.direction === 'outbound'
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          )}
                        >
                          {format(new Date(msg.dateAdded), 'd MMM HH:mm', { locale: nl })}
                          {msg.status && msg.direction === 'outbound' && (
                            <span className="ml-1.5">
                              {msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : ''}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Compose area with channel tabs */}
            <MessageComposer
              onSend={handleSendMessage}
              sending={false}
              conversationType={selectedConv.type}
            />
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

      {/* Contact Details Panel */}
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
