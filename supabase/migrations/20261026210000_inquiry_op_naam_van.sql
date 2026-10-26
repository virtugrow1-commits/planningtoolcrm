-- "Op naam van" op de aanvraag
--
-- Bij een particulier feest (bijv. 50-jarig huwelijk) is de aanvrager (contact)
-- vaak niet degene van wie het feest is. Het contact blijft de aanvrager: die
-- krijgt de offerte, tekent, krijgt de factuur en alle communicatie. Dit veld
-- bepaalt alleen de naam die als bedrijfsnaam/kop op offerte en
-- reserveringsbevestiging komt (offerte_bedrijfsnaam / reservering_bedrijfsnaam).
-- Leeg = zoals voorheen (bedrijf, anders naam van het contact).

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS op_naam_van text;
