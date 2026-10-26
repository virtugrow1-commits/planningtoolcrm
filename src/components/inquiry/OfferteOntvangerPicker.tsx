import { useMemo } from 'react';
import { AlertTriangle, Mail, Phone } from 'lucide-react';
import CrmCombobox, { type ComboboxOption } from '@/components/CrmCombobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useContactCompanies } from '@/hooks/useContactCompanies';
import type { Contact } from '@/types/crm';

function contactLabel(c: Pick<Contact, 'firstName' | 'infix' | 'lastName' | 'email'>): string {
  return [c.firstName, c.infix, c.lastName].filter((n) => n && n !== '—').join(' ') || c.email || 'Onbekend';
}

interface Props {
  /** Contact van de aanvraag (standaardkeuze) */
  inquiryContactId?: string;
  companyId?: string;
  companyName?: string;
  ontvangerId: string;
  onOntvangerChange: (id: string) => void;
  opNaamVan: string;
  onOpNaamVanChange: (v: string) => void;
  disabled?: boolean;
}

/**
 * Keuze in het venster "Offerte klaarzetten": wie krijgt en tekent de offerte,
 * en (optioneel) op wiens naam staat het feest.
 * Wordt alleen gerenderd als het venster open is, zodat de koppelingen
 * contact–bedrijf pas dan worden opgehaald.
 */
export default function OfferteOntvangerPicker({
  inquiryContactId, companyId, companyName, ontvangerId, onOntvangerChange, opNaamVan, onOpNaamVanChange, disabled,
}: Props) {
  const { contacts } = useContactsContext();
  const { links } = useContactCompanies();

  const options = useMemo((): ComboboxOption[] => {
    const companyContactIds = new Set<string>();
    if (companyId) {
      for (const l of links) if (l.companyId === companyId && !l.departedAt) companyContactIds.add(l.contactId);
      for (const c of contacts) if (c.companyId === companyId && !c.departed) companyContactIds.add(c.id);
    }
    const toOption = (c: Contact, group: string): ComboboxOption => ({
      id: c.id,
      label: contactLabel(c),
      secondary: c.email || 'geen e-mailadres',
      tertiary: c.phone || c.mobile || undefined,
      searchText: `${c.firstName} ${c.infix || ''} ${c.lastName} ${c.email || ''} ${c.company || ''} ${c.phone || ''}`,
      group,
    });

    const huidig = contacts.filter((c) => c.id === inquiryContactId);
    const vanBedrijf = contacts
      .filter((c) => c.id !== inquiryContactId && companyContactIds.has(c.id))
      .sort((a, b) => Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false) || contactLabel(a).localeCompare(contactLabel(b)));
    const overig = contacts
      .filter((c) => c.id !== inquiryContactId && !companyContactIds.has(c.id) && !c.departed)
      .sort((a, b) => contactLabel(a).localeCompare(contactLabel(b)));

    return [
      ...huidig.map((c) => toOption(c, 'Contact van deze aanvraag')),
      ...vanBedrijf.map((c) => toOption(c, `Contactpersonen van ${companyName || 'het bedrijf'}`)),
      ...overig.map((c) => toOption(c, 'Overige contacten')),
    ];
  }, [contacts, links, inquiryContactId, companyId, companyName]);

  const gekozen = contacts.find((c) => c.id === ontvangerId);
  const gewijzigd = Boolean(ontvangerId && inquiryContactId && ontvangerId !== inquiryContactId);

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-1.5">
        <Label>Offerte aan (contactpersoon)</Label>
        <CrmCombobox
          options={options}
          value={ontvangerId}
          onSelect={(id) => onOntvangerChange(id || inquiryContactId || '')}
          displayValue={gekozen ? contactLabel(gekozen) : undefined}
          placeholder="Kies contactpersoon..."
          searchPlaceholder="Zoek op naam, e-mail of bedrijf..."
          popoverWidth="w-[380px]"
          disabled={disabled}
        />
        {gekozen && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <Mail size={12} className="text-muted-foreground" />
              {gekozen.email ? gekozen.email : <span className="text-destructive">Geen e-mailadres. Vul dat eerst in bij het contact.</span>}
            </div>
            {(gekozen.phone || gekozen.mobile) && (
              <div className="flex items-center gap-1.5"><Phone size={12} className="text-muted-foreground" />{gekozen.phone || gekozen.mobile}</div>
            )}
          </div>
        )}
        {gewijzigd && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Deze persoon wordt het contact van de aanvraag: offerte, factuur, reserveringsbevestiging en alle communicatie gaan dan naar hem of haar.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Op naam van <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
        <Input
          value={opNaamVan}
          placeholder="bijv. Fam. Jansen – 50-jarig huwelijk"
          onChange={(e) => onOpNaamVanChange(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Komt op de offerte in plaats van de bedrijfsnaam. Leeg laten = bedrijfsnaam, anders de naam van de contactpersoon.
        </p>
      </div>
    </div>
  );
}
