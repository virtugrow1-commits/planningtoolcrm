import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import * as pdfjsLib from 'pdfjs-dist';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface OverlayField {
  id: string;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
}

interface PublicQuote {
  id: string;
  display_number: string;
  contact_name: string;
  company_name: string | null;
  client_email: string | null;
  title: string;
  introduction: string | null;
  terms_and_conditions: string | null;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total: number;
  status: string;
  valid_until: string | null;
  pdf_url: string | null;
  overlay_fields: OverlayField[] | null;
  accepted_at: string | null;
  declined_at: string | null;
  client_address: string | null;
}

/** Replace merge tags like {{client_name}} with actual quote values */
function resolveMergeTag(value: string, quote: PublicQuote): string {
  if (!value.startsWith('{{')) return value;
  const map: Record<string, string> = {
    '{{client_name}}': quote.contact_name || '',
    '{{company_name}}': quote.company_name || '',
    '{{client_email}}': quote.client_email || '',
    '{{client_address}}': quote.client_address || '',
    '{{quote_number}}': quote.display_number || '',
    '{{date}}': new Date().toLocaleDateString('nl-NL'),
    '{{valid_until}}': quote.valid_until
      ? format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: nl })
      : '',
    '{{subtotal}}': `€ ${Number(quote.subtotal).toFixed(2)}`,
    '{{vat_amount}}': `€ ${Number(quote.vat_amount).toFixed(2)}`,
    '{{total}}': `€ ${Number(quote.total).toFixed(2)}`,
  };
  return map[value] ?? value;
}

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 595, height: 842 });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responded, setResponded] = useState<'accepted' | 'declined' | null>(null);
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [containerScale, setContainerScale] = useState(1);

  // Fetch quote by public token
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: err } = await supabase
        .from('quotes')
        .select('*')
        .eq('public_token', token)
        .single();

      if (err || !data) {
        setError('Dit document kon niet worden gevonden of is niet meer beschikbaar.');
        setLoading(false);
        return;
      }

      const q = data as any as PublicQuote;
      q.overlay_fields = (data.overlay_fields as any) || [];
      setQuote(q);

      if (q.status === 'accepted') setResponded('accepted');
      if (q.status === 'declined') setResponded('declined');

      // Mark as viewed
      if (q.status === 'sent') {
        await supabase
          .from('quotes')
          .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
          .eq('id', q.id);
      }

      setLoading(false);
    })();
  }, [token]);

  // Render PDF
  useEffect(() => {
    if (!quote?.pdf_url) return;
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(quote.pdf_url!).promise;
        const rendered: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push(canvas.toDataURL());
          if (i === 1) setPdfDimensions({ width: viewport.width, height: viewport.height });
        }
        setPages(rendered);
      } catch {
        console.error('PDF load error');
      }
    })();
  }, [quote?.pdf_url]);

  // Scale calculation
  useEffect(() => {
    if (pages.length === 0 || !containerRefs.current[0]) return;
    const updateScale = () => {
      const w = containerRefs.current[0]?.clientWidth || 600;
      setContainerScale(w / pdfDimensions.width);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pages, pdfDimensions.width]);

  const handleAccept = async () => {
    if (!quote || !agreed) return;
    setSubmitting(true);
    await supabase
      .from('quotes')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', quote.id);
    setResponded('accepted');
    setSubmitting(false);
  };

  const handleDecline = async () => {
    if (!quote) return;
    setSubmitting(true);
    await supabase
      .from('quotes')
      .update({ status: 'declined', declined_at: new Date().toISOString() })
      .eq('id', quote.id);
    setResponded('declined');
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Document laden...</div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overlayFields = quote.overlay_fields || [];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header bar */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{quote.title}</h1>
            <p className="text-sm text-muted-foreground">
              {quote.display_number} · Voor {quote.contact_name}
              {quote.company_name ? ` · ${quote.company_name}` : ''}
            </p>
          </div>
          {responded && (
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                responded === 'accepted'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {responded === 'accepted' ? 'Akkoord' : 'Niet akkoord'}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Introduction */}
        {quote.introduction && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm whitespace-pre-wrap text-foreground">{quote.introduction}</p>
            </CardContent>
          </Card>
        )}

        {/* PDF pages with overlay fields */}
        {pages.map((pageDataUrl, pageIndex) => {
          const pageFields = overlayFields.filter((f) => f.page === pageIndex);
          return (
            <Card key={pageIndex} className="overflow-hidden">
              <div
                ref={(el) => { containerRefs.current[pageIndex] = el; }}
                className="relative"
                style={{ height: pdfDimensions.height * containerScale }}
              >
                <img
                  src={pageDataUrl}
                  alt={`Pagina ${pageIndex + 1}`}
                  className="w-full h-auto pointer-events-none select-none"
                  draggable={false}
                />
                {/* Overlay fields with resolved merge tags */}
                {pageFields.map((field) => (
                  <div
                    key={field.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: field.x * containerScale,
                      top: field.y * containerScale,
                      width: field.width * containerScale,
                      height: field.height * containerScale,
                      fontSize: field.fontSize * containerScale,
                      fontWeight: field.fontWeight,
                      color: field.color,
                    }}
                  >
                    <div className="w-full h-full flex items-center px-1 truncate">
                      {resolveMergeTag(field.value || field.label, quote)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {/* Terms */}
        {quote.terms_and_conditions && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-foreground mb-2">Voorwaarden</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {quote.terms_and_conditions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Accept / Decline section */}
        {!responded && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Reserveringsovereenkomst</h3>
              <p className="text-sm text-muted-foreground">
                Door akkoord te gaan bevestigt u de inhoud van dit document en gaat u akkoord met de bijbehorende voorwaarden.
              </p>

              <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="agree" className="text-sm text-foreground cursor-pointer leading-relaxed">
                  Ik heb het document gelezen en ga akkoord met de voorwaarden en afspraken zoals beschreven.
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleAccept}
                  disabled={!agreed || submitting}
                  className="gap-1.5 flex-1 sm:flex-none"
                >
                  <Check size={16} /> Akkoord
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDecline}
                  disabled={submitting}
                  className="gap-1.5 flex-1 sm:flex-none text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <X size={16} /> Niet akkoord
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Response confirmation */}
        {responded && (
          <Card>
            <CardContent className="pt-6 text-center">
              {responded === 'accepted' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Check size={24} className="text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Bedankt voor uw akkoord!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Uw bevestiging is ontvangen op{' '}
                    {format(new Date(), "dd MMMM yyyy 'om' HH:mm", { locale: nl })}.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <X size={24} className="text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">U heeft niet akkoord gegeven</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Neem contact op als u vragen heeft of wijzigingen wilt bespreken.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8">
          {quote.valid_until && (
            <p>
              Dit document is geldig tot{' '}
              {format(new Date(quote.valid_until), 'dd MMMM yyyy', { locale: nl })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
