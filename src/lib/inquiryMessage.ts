/**
 * Parsing van het `message`-veld van een aanvraag.
 * Doel: echte formuliervelden ("Label: waarde") scheiden van vrije tekst,
 * zonder volzinnen met een dubbele punt te verminken of de volgorde te verspringen.
 */

/** Cryptische GHL veld-ids naar leesbare labels */
export const FIELD_LABEL_MAP: Record<string, string> = {
  Saalh7jouh8kpkx4ntx9: 'Extra informatie over',
  V2uhrncbin2tugy7iug0: 'Contactpersoon',
  '3kgpapaxtsha4cc3omeu': 'Aantal gasten',
  Joqfpmtxpjwwri15fhmo: 'Dagdeel',
  Dey06emx0wklhdik6ugt: 'Gewenste datum',
  Xuurzij60jz76tpgjqgn: 'Extra informatie',
};

/** Bekende formulierlabels (lowercase, zonder dubbele punt) */
const KNOWN_LABELS = [
  'type gelegenheid',
  'gewenste datum',
  'aantal gasten',
  'aantal personen',
  'bedrijfsnaam',
  'selecteer dagdeel',
  'dagdeel',
  'extra informatie',
  'extra informatie over',
  'toelichting',
  'contactpersoon',
  'budget',
  'gewenste zaalopstelling',
  'zaalopstelling',
  'ruimte voorkeur',
  'voorkeur ruimte',
  'e-mail',
  'email',
  'telefoon',
  'telefoonnummer',
  'naam',
  'voornaam',
  'achternaam',
  'starttijd',
  'eindtijd',
  'source',
  'bron',
  'ik wil graag reserveren voor',
];

export interface InquiryField {
  label: string;
  value: string;
}

export interface ParsedInquiryMessage {
  fields: InquiryField[];
  /** Vrije tekst in originele volgorde, alinea's behouden */
  freeText: string;
}

/** Bepaalt of het deel vóór de dubbele punt een echt veldlabel is */
function isFieldLabel(raw: string): boolean {
  const label = raw.trim();
  if (!label || label.length > 35) return false;
  // Volzin-indicatoren: geen labels
  if (/[.,!?()€%]/.test(label)) return false;
  if (label.split(/\s+/).length > 4) return false;

  const lower = label.toLowerCase().replace(/\s+/g, ' ');
  if (FIELD_LABEL_MAP[label]) return true;
  if (KNOWN_LABELS.includes(lower)) return true;
  // Patroon van een veldnaam: begint met hoofdletter/veld-id, geen werkwoordelijke zin
  if (/^[A-Za-z0-9][\w\-/&' ]*$/.test(label) && label.split(/\s+/).length <= 4) {
    // Sluit persoonlijke aanhef/zinsstarters uit
    if (/^(hi|hallo|beste|hey|dag|goedemorgen|goedemiddag|wij|we|ik|jullie|dit|dat|het|de|een|voor|met|graag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i.test(label)) {
      return false;
    }
    return true;
  }
  return false;
}

export function parseInquiryMessage(message?: string | null): ParsedInquiryMessage {
  const fields: InquiryField[] = [];
  const freeLines: string[] = [];
  if (!message) return { fields, freeText: '' };

  const lines = message.replace(/\r\n/g, '\n').split('\n');
  let lastFieldIndex = -1;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      // lege regel: alinea-scheiding
      if (lastFieldIndex >= 0) {
        fields[lastFieldIndex].value += '\n';
      } else if (freeLines.length && freeLines[freeLines.length - 1] !== '') {
        freeLines.push('');
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const rawLabel = line.substring(0, colonIdx).trim();
      if (isFieldLabel(rawLabel)) {
        const label = FIELD_LABEL_MAP[rawLabel] || rawLabel;
        fields.push({ label, value: line.substring(colonIdx + 1).trim() });
        lastFieldIndex = fields.length - 1;
        continue;
      }
    }

    // Vervolgregel van een meerregelige veldwaarde
    if (lastFieldIndex >= 0) {
      fields[lastFieldIndex].value = `${fields[lastFieldIndex].value}\n${line.trim()}`.trim();
      continue;
    }

    freeLines.push(line.trim());
  }

  // trailing lege regels weg
  while (freeLines.length && freeLines[freeLines.length - 1] === '') freeLines.pop();

  return { fields, freeText: freeLines.join('\n') };
}
