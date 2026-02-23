import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, X, Paperclip, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type Channel = 'sms' | 'email';

interface Props {
  onSend: (message: string, channel: Channel, options?: { subject?: string; cc?: string; bcc?: string }) => Promise<void>;
  sending: boolean;
  conversationType?: string;
  contactPhone?: string;
}

export default function MessageComposer({ onSend, sending, conversationType, contactPhone }: Props) {
  const [activeChannel, setActiveChannel] = useState<Channel>('email');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const channels: { id: Channel; label: string }[] = [
    { id: 'sms', label: 'SMS' },
    { id: 'email', label: 'E-mail' },
  ];

  const handleSend = async () => {
    if (!message.trim()) return;
    const options: any = {};
    if (activeChannel === 'email') {
      if (subject.trim()) options.subject = subject.trim();
      if (cc.trim()) options.cc = cc.trim();
      if (bcc.trim()) options.bcc = bcc.trim();
    }
    await onSend(message.trim(), activeChannel, options);
    setMessage('');
    setSubject('');
    setCc('');
    setBcc('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSms = activeChannel === 'sms';

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
        {isSms ? (
          <div className="py-4 text-center space-y-2">
            {contactPhone ? (
              <p className="text-sm font-medium text-foreground">{contactPhone}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Geen telefoonnummer beschikbaar</p>
            )}
            <p className="text-xs text-muted-foreground">
              SMS versturen is momenteel niet beschikbaar
            </p>
          </div>
        ) : (
          <>
            <Input
              placeholder="Onderwerp..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowCcBcc(!showCcBcc)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                CC/BCC {showCcBcc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showCcBcc && (
              <div className="space-y-2">
                <Input
                  placeholder="CC (e-mailadressen, gescheiden door komma)"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="BCC (e-mailadressen, gescheiden door komma)"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
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
                <Button variant="outline" size="sm" onClick={() => { setMessage(''); setSubject(''); setCc(''); setBcc(''); }}>
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
