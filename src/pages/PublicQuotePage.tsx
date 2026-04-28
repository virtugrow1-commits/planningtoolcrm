import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import DocumentViewer from '@/components/quotation/DocumentViewer';
import TemplatePreview from '@/components/quotation/TemplatePreview';
import SignaturePad from '@/components/pdf-editor/SignaturePad';
import { resolveBlocksMergeTags } from '@/lib/mergeTags';
import type { MergeTagData } from '@/lib/mergeTags';
import type { LineItem } from '@/types/quotation';

interface PublicQuote {
  id: string;
  display_number: string;
  contact_name: string;
  company_name: string | null;
  client_email: string | null;
  client_address: string | null;
  title: string;
  introduction: string | null;
  terms_and_conditions: string | null;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total: number;
  status: string;
  valid_until: string | null;
  content_blocks: any[] | null;
  // Legacy overlay fields
  pdf_url: string | null;
  overlay_fields: any[] | null;
  accepted_at: string | null;
  declined_at: string | null;
}

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responded, setResponded] = useState<'accepted' | 'declined' | null>(null);
  const [signatureValues, setSignatureValues] = useState<Record<string, string>>({});
  const [checkboxValues, setCheckboxValues] = useState<Record<string, boolean>>({});
  const [resolvedBlocks, setResolvedBlocks] = useState<any[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [signature, setSignature] = useState<string>('');
  const [sigPadOpen, setSigPadOpen] = useState(false);

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

      // Resolve blocks with quote data
      const rawBlocks: any[] = q.content_blocks || [];
      if (rawBlocks.length > 0) {
        const mergeData: MergeTagData = {
          contact: { name: q.contact_name, email: q.client_email || undefined },
          company: { name: q.company_name || undefined },
          quote: {
            display_number: q.display_number,
            title: q.title,
            subtotal: q.subtotal,
            vat_amount: q.vat_amount,
            total: q.total,
            valid_until: q.valid_until || undefined,
          },
        };
        setResolvedBlocks(resolveBlocksMergeTags(rawBlocks, mergeData));
      }

      // Fetch line items so the product table appears in the preview
      const { data: items } = await supabase
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', q.id)
        .order('sort_order');
      if (items) {
        setLineItems(items.map((li: any) => ({
          id: li.id,
          itemName: li.item_name,
          description: li.description || '',
          quantity: Number(li.quantity),
          unitPrice: Number(li.unit_price),
          discountPercent: Number(li.discount_percent || 0),
          vatRate: Number(li.vat_rate),
          lineTotal: Number(li.line_total),
          sortOrder: Number(li.sort_order || 0),
        })));
      }

      setLoading(false);
    })();
  }, [token]);

  const hasRequiredSignatures = () => {
    if (!resolvedBlocks.length) return true;
    const sigBlocks = resolvedBlocks.filter((b) => b.type === 'signature' && b.required);
    return sigBlocks.every((b) => signatureValues[b.id]);
  };

  const hasRequiredCheckboxes = () => {
    if (!resolvedBlocks.length) return true;
    const cbBlocks = resolvedBlocks.filter((b) => b.type === 'checkbox' && b.required);
    return cbBlocks.every((b) => checkboxValues[b.id]);
  };

  const canAccept = agreed && hasRequiredSignatures() && hasRequiredCheckboxes();

  const handleAccept = async () => {
    if (!quote || !canAccept) return;
    setSubmitting(true);

    // Get client IP (best effort)
    let ip = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      ip = json.ip || '';
    } catch { /* ignore */ }

    // Save signature if any
    const firstSig = Object.values(signatureValues).find(Boolean) || null;

    // Update quote
    await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        signature_data: firstSig,
        signature_ip: ip || null,
      })
      .eq('id', quote.id);

    // Invoice creation happens manually by the team after acceptance

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
      <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Document laden...</div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background flex items-center justify-center px-4">
        <Card className="max-w-md card-shadow">
          <CardContent className="pt-6 text-center">
            <FileText size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date();

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 via-background to-background pb-32">
      {/* Warm hero */}
      <div className="sidebar-gradient text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground/70">
                {quote.display_number}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold mt-2 leading-tight">{quote.title}</h1>
              <p className="text-sm text-primary-foreground/85 mt-2">
                Voor <span className="font-semibold">{quote.contact_name}</span>
                {quote.company_name ? <> · {quote.company_name}</> : null}
              </p>
            </div>
            {responded && (
              <div
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                  responded === 'accepted'
                    ? 'bg-success text-success-foreground'
                    : 'bg-destructive text-destructive-foreground'
                }`}
              >
                {responded === 'accepted' ? <Check size={12} /> : <X size={12} />}
                {responded === 'accepted' ? 'Akkoord gegeven' : 'Niet akkoord'}
              </div>
            )}
          </div>
          {quote.valid_until && (
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 text-xs">
              <span className="text-primary-foreground/80">Geldig tot</span>
              <span className="font-semibold">{format(new Date(quote.valid_until), 'dd MMMM yyyy', { locale: nl })}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Expired warning */}
        {isExpired && !responded && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                Dit document is verlopen op {format(new Date(quote.valid_until!), 'dd MMMM yyyy', { locale: nl })}.
                Neem contact op voor een nieuwe versie.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Introduction (legacy) */}
        {quote.introduction && !resolvedBlocks.length && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm whitespace-pre-wrap text-foreground">{quote.introduction}</p>
            </CardContent>
          </Card>
        )}

        {/* Block-based document — render with PDF background like the editor preview */}
        {resolvedBlocks.length > 0 && quote.pdf_url ? (
          <div className="bg-white rounded-md border border-border/40 p-4 sm:p-6">
            <TemplatePreview
              pdfUrl={quote.pdf_url}
              blocks={resolvedBlocks as any}
              lineItems={lineItems}
              totals={{
                subtotal: quote.subtotal,
                vatAmount: quote.vat_amount,
                discountAmount: quote.discount_amount,
                total: quote.total,
              }}
            />
          </div>
        ) : resolvedBlocks.length > 0 ? (
          <DocumentViewer
            blocks={resolvedBlocks}
            onSignatureCapture={
              !responded
                ? (id, data) => setSignatureValues((p) => ({ ...p, [id]: data }))
                : undefined
            }
            onCheckboxChange={
              !responded
                ? (id, checked) => setCheckboxValues((p) => ({ ...p, [id]: checked }))
                : undefined
            }
            signatureValues={signatureValues}
            checkboxValues={checkboxValues}
          />
        ) : null}

        {/* Signature section — when using PDF preview, capture signature here */}
        {!responded && quote.pdf_url && resolvedBlocks.some((b: any) => b.type === 'signature') && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Uw handtekening</h3>
              <p className="text-xs text-muted-foreground">
                Plaats hieronder uw handtekening om akkoord te geven.
              </p>
              {signature ? (
                <div className="border rounded p-2 bg-muted/30">
                  <img src={signature} alt="Handtekening" className="max-h-24" />
                  <Button size="sm" variant="ghost" onClick={() => { setSignature(''); setSignatureValues({}); }}>
                    Opnieuw
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setSigPadOpen(true)}>
                  Handtekening plaatsen
                </Button>
              )}
              <SignaturePad
                open={sigPadOpen}
                onClose={() => setSigPadOpen(false)}
                onSave={(data) => {
                  setSignature(data);
                  const sigIds: Record<string, string> = {};
                  resolvedBlocks.forEach((b: any) => {
                    if (b.type === 'signature') sigIds[b.id] = data;
                  });
                  setSignatureValues((p) => ({ ...p, ...sigIds }));
                  setSigPadOpen(false);
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Terms (legacy / template-level) */}
        {quote.terms_and_conditions && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-foreground mb-2">Algemene voorwaarden</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {quote.terms_and_conditions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Accept / Decline section */}
        {!responded && !isExpired && (
          <Card className="card-shadow border-border/70">
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Uw akkoord</h3>
              <p className="text-sm text-muted-foreground">
                Door akkoord te gaan bevestigt u de inhoud van dit document en gaat u akkoord met de bijbehorende voorwaarden.
              </p>

              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-secondary/40">
                <input
                  type="checkbox"
                  id="agree"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary"
                />
                <label htmlFor="agree" className="text-sm text-foreground cursor-pointer leading-relaxed">
                  Ik heb het document gelezen en ga akkoord met de inhoud en voorwaarden zoals beschreven.
                </label>
              </div>

              {!hasRequiredSignatures() && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-warning-foreground">
                    Zet uw handtekening in het document hierboven om verder te gaan.
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary underline shrink-0 ml-auto"
                    onClick={() => {
                      const el = document.querySelector('[data-block-type="signature"]');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    Ga naar handtekening
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Response confirmation */}
        {responded && (
          <Card className="card-shadow border-border/70">
            <CardContent className="pt-8 pb-8 text-center">
              {responded === 'accepted' ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
                    <Check size={28} className="text-success" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Bedankt voor uw akkoord!</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                    Uw bevestiging is ontvangen op{' '}
                    {format(new Date(), "dd MMMM yyyy 'om' HH:mm", { locale: nl })}.
                    U ontvangt binnenkort een factuur.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <X size={28} className="text-destructive" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">U heeft niet akkoord gegeven</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                    Neem contact op als u vragen heeft of wijzigingen wilt bespreken.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pt-4">
          {quote.valid_until && (
            <p>
              Dit document is geldig tot{' '}
              {format(new Date(quote.valid_until), 'dd MMMM yyyy', { locale: nl })}
            </p>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      {!responded && !isExpired && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.08)]">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {agreed ? 'Klaar om te bevestigen' : 'Vink akkoord aan om verder te gaan'}
            </p>
            <div className="flex gap-2 flex-1 sm:flex-none sm:ml-auto">
              <Button
                variant="outline"
                onClick={handleDecline}
                disabled={submitting}
                className="gap-1.5 flex-1 sm:flex-none text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <X size={16} /> Niet akkoord
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!canAccept || submitting}
                size="lg"
                className="gap-1.5 flex-1 sm:flex-none shadow-md"
              >
                <Check size={16} /> {submitting ? 'Verwerken...' : 'Offerte accepteren'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
