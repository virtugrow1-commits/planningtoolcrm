import { useState } from 'react';
import { Send, Paperclip, Loader2, Mail } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Quote } from '@/types/quotation';

interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  onSent: () => void;
}

const FROM_ADDRESS = 'contact@ontmoetenaandedonge.nl';

export default function SendQuoteDialog({ open, onOpenChange, quote, onSent }: SendQuoteDialogProps) {
  const { toast } = useToast();
  const [recipientEmail, setRecipientEmail] = useState(quote.clientEmail || '');
  const [subject, setSubject] = useState(`Offerte ${quote.displayNumber || ''} van Ontmoeten aan de Donge`);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipientEmail.trim()) {
      toast({ title: 'E-mailadres ontbreekt', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-quote-email', {
        body: {
          quoteId: quote.id,
          recipientEmail: recipientEmail.trim(),
          subject,
          message: message.trim() || undefined,
        },
      });

      if (error || (data && data.error)) {
        const details = (data?.details as string) || error?.message || 'Onbekende fout';
        toast({
          title: 'Verzenden mislukt',
          description: details.includes('domain') || details.includes('verified')
            ? 'Het e-maildomein is nog niet geverifieerd. Voltooi eerst de DNS-instellingen.'
            : details,
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Offerte verzonden', description: `Naar ${recipientEmail}` });
      onSent();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Verzenden mislukt', description: e?.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={18} className="text-primary" /> Offerte verzenden
          </DialogTitle>
          <DialogDescription>
            De offerte wordt als PDF-bijlage verstuurd vanaf <strong>{FROM_ADDRESS}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="recipient">Naar</Label>
            <Input
              id="recipient"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="klant@voorbeeld.nl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Onderwerp</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">Persoonlijk bericht (optioneel)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Laat dit leeg voor de standaard begeleidende tekst."
              className="min-h-[110px]"
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Paperclip size={14} />
            <span>Bijlage: <strong className="text-foreground">{quote.displayNumber || 'offerte'}.pdf</strong></span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Annuleren
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Verzenden...' : 'Verstuur naar klant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
