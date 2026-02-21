import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Send,
  RefreshCw,
  MessageSquare,
  Phone,
  Mail,
  Instagram,
  Globe,
  ArrowLeft,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  lastMessageBody: string;
  lastMessageDate: string;
  lastMessageType: string;
  lastMessageDirection: string;
  unreadCount: number;
  type: string; // SMS, Email, etc.
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
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedConv) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-sync', {
        body: {
          action: 'send-message',
          conversationId: selectedConv.id,
          contactId: selectedConv.contactId,
          message: replyText.trim(),
          type: 'Email',
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Verzenden mislukt');

      // Add the sent message locally
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId || `local-${Date.now()}`,
          body: replyText.trim(),
          direction: 'outbound',
          dateAdded: new Date().toISOString(),
          type: selectedConv.type || 'SMS',
          status: 'sent',
        },
      ]);
      setReplyText('');
      inputRef.current?.focus();
    } catch (err: any) {
      toast({ title: 'Fout bij verzenden', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTypeIcon = (type: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('sms') || t.includes('phone')) return Phone;
    if (t.includes('email')) return Mail;
    if (t.includes('instagram') || t.includes('ig')) return Instagram;
    if (t.includes('whatsapp') || t.includes('wa')) return MessageSquare;
    if (t.includes('web') || t.includes('chat') || t.includes('live')) return Globe;
    return MessageSquare;
  };

  const filteredConversations = conversations;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation List */}
      <div
        className={cn(
          'w-full md:w-96 border-r flex flex-col shrink-0 bg-card',
          selectedConv && 'hidden md:flex'
        )}
      >
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-foreground">Gesprekken</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchConversations}
              disabled={loading}
              className="h-8 w-8"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Zoek gesprekken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchConversations()}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading && conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Laden...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Geen gesprekken gevonden
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => {
                const TypeIcon = getTypeIcon(conv.type);
                const isActive = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={cn(
                      'w-full text-left px-3 py-3 hover:bg-accent/50 transition-colors',
                      isActive && 'bg-accent/50'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 rounded-full bg-muted p-1.5 shrink-0">
                        <TypeIcon size={14} className="text-muted-foreground" />
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
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {conv.type || 'SMS'}
                          </Badge>
                          {conv.unreadCount > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Message Thread */}
      <div
        className={cn(
          'flex-1 flex flex-col',
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

            {/* Reply input - only for email conversations */}
            <div className="p-3 border-t bg-card">
              {selectedConv.type?.toLowerCase().includes('email') || selectedConv.type === 'TYPE_EMAIL' ? (
                <div className="flex items-center gap-2 max-w-2xl mx-auto">
                  <Input
                    ref={inputRef}
                    placeholder="Typ een e-mail antwoord..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!replyText.trim() || sending}
                  >
                    <Send size={16} />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-center text-muted-foreground">
                  Beantwoorden is momenteel alleen mogelijk via e-mail
                </p>
              )}
            </div>
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
    </div>
  );
}
