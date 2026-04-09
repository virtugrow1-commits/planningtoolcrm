import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import DocumentViewer from './DocumentViewer';
import type { Quote } from '@/types/quotation';

interface QuotePreviewDialogProps {
  quote: Quote;
  contentBlocks: any[];
}

export default function QuotePreviewDialog({ quote, contentBlocks }: QuotePreviewDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Eye size={14} /> Voorbeeld
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between">
          <div>
            <DialogTitle className="text-lg font-bold">{quote.title}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {quote.displayNumber} · Zo ziet de klant het document
            </p>
          </div>
        </div>

        <div className="bg-muted/30 p-6 space-y-6">
          {/* Client header info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Voor:</span>{' '}
                  <span className="font-medium text-foreground">{quote.contactName}</span>
                </div>
                {quote.companyName && (
                  <div>
                    <span className="text-muted-foreground">Bedrijf:</span>{' '}
                    <span className="font-medium text-foreground">{quote.companyName}</span>
                  </div>
                )}
                {quote.clientEmail && (
                  <div>
                    <span className="text-muted-foreground">E-mail:</span>{' '}
                    <span className="text-foreground">{quote.clientEmail}</span>
                  </div>
                )}
                {quote.validUntil && (
                  <div>
                    <span className="text-muted-foreground">Geldig tot:</span>{' '}
                    <span className="text-foreground">
                      {format(new Date(quote.validUntil), 'dd MMMM yyyy', { locale: nl })}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Introduction */}
          {quote.introduction && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm whitespace-pre-wrap text-foreground">{quote.introduction}</p>
              </CardContent>
            </Card>
          )}

          {/* Document blocks */}
          {contentBlocks.length > 0 ? (
            <DocumentViewer blocks={contentBlocks} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Dit document heeft nog geen inhoud via een sjabloon. Voeg blokken toe aan het sjabloon om hier een voorbeeld te zien.
              </CardContent>
            </Card>
          )}

          {/* Terms */}
          {quote.termsAndConditions && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">Algemene voorwaarden</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {quote.termsAndConditions}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Accept/Decline preview (disabled) */}
          <Card className="opacity-60">
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Uw akkoord</h3>
              <p className="text-sm text-muted-foreground">
                Door akkoord te gaan bevestigt u de inhoud van dit document en gaat u akkoord met de bijbehorende voorwaarden.
              </p>
              <div className="flex gap-3 pt-2">
                <Button disabled className="gap-1.5">
                  Akkoord
                </Button>
                <Button variant="outline" disabled className="gap-1.5">
                  Niet akkoord
                </Button>
              </div>
              <p className="text-xs text-muted-foreground italic">
                (Dit is een voorbeeld — de knoppen werken niet)
              </p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
