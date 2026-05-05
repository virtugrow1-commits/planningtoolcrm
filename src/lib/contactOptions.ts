// Centralised dropdown values for CRM contact fields.
// Sourced from the legacy BUUT system. Adjust here once we receive
// the final list from the user — it propagates to all forms.

export const DMU_OPTIONS = [
  'Gebruiker / deelnemer',
  'Beïnvloeder',
  'Beslisser',
] as const;

export const FUNCTION_GROUP_OPTIONS = [
  'Directie / Management',
  'Secretariaat / Ondersteuning (staf)',
  'Midden Management / Teamleiders (lijn)',
  'Uitvoerende medewerkers',
  'Ondernemingsraad',
] as const;
