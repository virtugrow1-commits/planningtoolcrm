// Melding naar het eigen adres (contact@ontmoetenaandedonge.nl) zodra een offerte
// of reserveringsbevestiging vanuit CliqCRM naar de klant is verzonden.
//
// Waarom naast de CC van CliqCRM: die CC wordt verstuurd vanaf
// contact@ontmoetenaandedonge.nl naar contact@ontmoetenaandedonge.nl. Microsoft 365
// ziet dat als mail "van zichzelf" die van buiten komt en zet hem vaak in
// Ongewenste e-mail of quarantaine, terwijl CliqCRM hem als afgeleverd meldt.
// Deze melding komt via een ander afzenderadres (send.ontmoetenaandedonge.nl) en
// gaat ook mee bij revisie 2, 3, … (elk verzonden document krijgt er één).

import { isQuoteDocument, isReservationConfirmation, type QuoteDocumentsConfig } from "./automations.ts";

export const NOTIFY_FROM = "Ontmoeten aan de Donge <contact@send.ontmoetenaandedonge.nl>";
export const NOTIFY_TO_DEFAULT = "contact@ontmoetenaandedonge.nl";
export const BUUT_URL = "https://buut.cliqmakers.nl";

export interface DocumentNotifyConfig {
  to?: string | string[];
  /** Alleen documenten verzonden na dit moment (ISO); voorkomt meldingen voor oude documenten. */
  vanaf?: string | null;
  /** Hoe ver terug (uren) een verzonden document nog een melding krijgt. */
  max_age_hours?: number;
}

export type NotifyKind = "offerte" | "reserveringsbevestiging";

export interface NotifyDoc {
  id: string;
  title?: string | null;
  document_type?: string | null;
  document_kind?: string | null;
  status?: string | null;
  sent_at?: string | null;
  contact_name?: string | null;
  inquiry_id?: string | null;
  external_url?: string | null;
  offerte_nummer?: string | null;
  amount?: number | null;
}

export function notifyKind(doc: NotifyDoc, qc: QuoteDocumentsConfig): NotifyKind | null {
  if (isReservationConfirmation(doc)) return "reserveringsbevestiging";
  if (isQuoteDocument(doc, qc)) return "offerte";
  return null;
}

export function notifyRecipients(cfg: DocumentNotifyConfig): string[] {
  const raw = Array.isArray(cfg.to) ? cfg.to : String(cfg.to || NOTIFY_TO_DEFAULT).split(",");
  const list = raw.map((s) => String(s).trim()).filter((s) => /.+@.+\..+/.test(s));
  return list.length ? [...new Set(list)] : [NOTIFY_TO_DEFAULT];
}

/** Moet dit document (nu) een melding krijgen? Alleen verzonden documenten, recent en na de start. */
export function shouldNotify(doc: NotifyDoc, cfg: DocumentNotifyConfig, now = Date.now()): boolean {
  if (!["sent", "viewed", "signed", "paid"].includes(String(doc.status || ""))) return false;
  const sent = Date.parse(String(doc.sent_at || ""));
  if (!Number.isFinite(sent)) return false;
  const vanaf = cfg.vanaf ? Date.parse(cfg.vanaf) : NaN;
  if (Number.isFinite(vanaf) && sent < vanaf) return false;
  const maxAge = (cfg.max_age_hours ?? 72) * 3600 * 1000;
  return now - sent <= maxAge;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function nlDateTime(iso: string | null | undefined): string {
  const d = new Date(String(iso || ""));
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} om ${p.hour}:${p.minute}`;
}

function euro(n: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n).replace(/ /g, " ");
}

export function buildNotification(doc: NotifyDoc, kind: NotifyKind): { subject: string; html: string; text: string } {
  const soort = kind === "offerte" ? "Offerte" : "Reserveringsbevestiging";
  const klant = (doc.contact_name || "").trim() || "onbekende klant";
  const titel = (doc.title || "").trim() || soort;
  const rows: [string, string][] = [
    ["Document", titel],
    ["Klant", klant],
    ["Verzonden op", nlDateTime(doc.sent_at)],
  ];
  if (doc.offerte_nummer) rows.push(["Offertenummer", doc.offerte_nummer]);
  if (typeof doc.amount === "number" && doc.amount > 0) rows.push(["Bedrag", euro(doc.amount)]);
  const links: [string, string][] = [];
  if (doc.inquiry_id) links.push(["Aanvraag in BUUT openen", `${BUUT_URL}/inquiries/${doc.inquiry_id}`]);
  if (doc.external_url) links.push(["Document bekijken", doc.external_url]);

  const subject = `${soort} verzonden aan ${klant}: ${titel}`;
  const text = [
    `${soort} is verzonden aan de klant.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(links.length ? ["", ...links.map(([k, v]) => `${k}: ${v}`)] : []),
    "",
    "Automatische melding uit BUUT. Het document is vanuit CliqCRM per e-mail naar de klant verstuurd.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
  <p style="font-size:16px;margin:0 0 12px"><strong>${esc(soort)}</strong> is verzonden aan de klant.</p>
  <table style="border-collapse:collapse;margin:0 0 16px">
    ${rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("\n    ")}
  </table>
  ${links.map(([k, v]) => `<p style="margin:0 0 8px"><a href="${esc(v)}" style="color:#a0522d">${esc(k)}</a></p>`).join("\n  ")}
  <p style="color:#888;font-size:12px;margin-top:20px">Automatische melding uit BUUT. Het document is vanuit CliqCRM per e-mail naar de klant verstuurd.</p>
</div>`;
  return { subject, html, text };
}
