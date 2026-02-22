import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Channel = 'sms' | 'whatsapp' | 'email';

interface Props {
  onSend: (message: string, channel: Channel, subject?: string) => Promise<void>;
  sending: boolean;
  conversationType?: string;
}

export default function MessageComposer({ onSend, sending, conversationType }: Props) {
  const [activeChannel, setActiveChannel] = useState<Channel>('email');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const channels: { id: Channel; label: string }[] = [
    { id: 'sms', label: 'SMS' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'email', label: 'E-mail' },
  ];

  const handleSend = async () => {
    if (!message.trim()) return;
    await onSend(message.trim(), activeChannel, activeChannel === 'email' ? subject.trim() : undefined);
    setMessage('');
    setSubject('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = activeChannel !== 'email';

  return (
    <div className="border-t bg-card">
      {/* Channel tabs */}
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-sm transition-colors',
                activeChannel === ch.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compose area */}
      <div className="p-3 space-y-2">
        {isDisabled ? (
          <p className="text-xs text-center text-muted-foreground py-4">
            {activeChannel === 'sms' ? 'SMS' : 'WhatsApp'} versturen is momenteel niet beschikbaar
          </p>
        ) : (
          <>
            {activeChannel === 'email' && (
              <Input
                placeholder="Onderwerp..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-8 text-sm"
              />
            )}
            <Textarea
              ref={textareaRef}
              placeholder="Typ een bericht..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="min-h-[80px] text-sm resize-y"
            />
            <div className="flex items-center justify-end gap-2">
              {message && (
                <Button variant="outline" size="sm" onClick={() => { setMessage(''); setSubject(''); }}>
                  Wissen
                </Button>
              )}
              <Button size="sm" onClick={handleSend} disabled={!message.trim() || sending}>
                <Send size={14} className="mr-1" />
                Versturen
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
