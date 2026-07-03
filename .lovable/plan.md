## Doel

DMU en Functiegroep zijn nu alleen zichtbaar/bewerkbaar op:
- Contact-detailpagina (edit-mode)
- CRM > Nieuw contact-dialoog
- Bedrijfsdetail > "Contact toevoegen na bedrijf"-flow

Ze **ontbreken** op andere plekken waar contactpersonen worden getoond of aangemaakt. De opties zelf blijven ongewijzigd (`src/lib/contactOptions.ts`).

## Wat ik toevoeg

### 1. Bedrijfsdetailpagina (`src/pages/CompanyDetailPage.tsx`)
- Op de lijst met contactpersonen van het bedrijf: DMU en Functiegroep tonen naast Functie/Afdeling.
- Bij inline bewerken van een contactrij: dropdowns voor DMU en Functiegroep toevoegen.

### 2. Nieuw-aanvraag-dialoog (`src/components/inquiry/NewInquiryDialog.tsx`)
- Als de flow een nieuw contact aanmaakt: DMU- en Functiegroep-dropdown toevoegen aan het contactformulier (onder Functie).

### 3. Gesprekken-zijpaneel (`src/components/conversations/ContactDetailsPanel.tsx`)
- Contactgegevens tonen ook DMU en Functiegroep (read-only) onder de bestaande velden.

## Wat níet verandert

- Waarden in `DMU_OPTIONS` en `FUNCTION_GROUP_OPTIONS` (blijven zoals ze zijn).
- Database-kolommen (`dmu`, `function_group` bestaan al op `contacts`).
- Bestaande UI-plekken die de velden al hebben.

## Technische details

- Dropdowns gebruiken shadcn `Select` met `DMU_OPTIONS` en `FUNCTION_GROUP_OPTIONS` uit `@/lib/contactOptions`.
- Bij read-only weergave: waarde tonen of `—` als leeg (zelfde patroon als op `ContactDetailPage`).
- Type `Contact` (`src/types/crm.ts`) heeft `dmu` en `functionGroup` al; geen typewijziging nodig.

## Verificatie

- Open een bedrijf → contactpersonen tonen DMU + Functiegroep; inline edit werkt en slaat op.
- Nieuwe aanvraag met nieuw contact → DMU + Functiegroep meegegeven en zichtbaar op contactdetail.
- Open een gesprek → paneel toont DMU + Functiegroep.

Zeg wanneer ik dit mag bouwen.
