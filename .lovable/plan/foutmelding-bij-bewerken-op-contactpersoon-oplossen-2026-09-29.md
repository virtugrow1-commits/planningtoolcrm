# Foutmelding bij "Bewerken" op contactpersoon oplossen

## Wat er misgaat
Klik je op Bewerken, dan crasht de pagina met "Rendered more hooks than during the previous render". Het nieuwe Klanttype-blok gebruikt een instelling (`pickBusiness`) die pas na de "niet bewerken"-weergave wordt aangemaakt. Daardoor verandert de volgorde bij het omschakelen.

## Oplossing
- In `src/pages/ContactDetailPage.tsx` (`CompanyField`): `const [pickBusiness, setPickBusiness] = useState(false)` verplaatsen naar boven, bij de andere `useState`-regels, dus vóór de vroege `return`s.
- Daarna in de preview controleren dat Bewerken opent zonder foutmelding en dat de Particulier/Bedrijf-keuze werkt.
