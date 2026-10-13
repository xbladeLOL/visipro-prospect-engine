INSERT INTO search_categories (slug, label, query_terms, lead_value_score, active)
VALUES
  ('paysagiste', 'Paysagistes', ARRAY['paysagiste','aménagement paysager'], 10, true),
  ('pisciniste', 'Piscinistes', ARRAY['pisciniste','construction piscine'], 10, true),
  ('architecte', 'Architectes', ARRAY['architecte','cabinet d''architecture'], 10, true),
  ('constructeur-maison', 'Constructeurs de maisons', ARRAY['constructeur maison individuelle'], 10, true),
  ('cuisiniste', 'Cuisinistes', ARRAY['cuisiniste','cuisine sur mesure'], 9, true),
  ('renovation-interieure', 'Rénovation intérieure', ARRAY['entreprise rénovation intérieure'], 9, true),
  ('decorateur-interieur', 'Décorateurs d''intérieur', ARRAY['décorateur intérieur','architecte d''intérieur'], 9, true),
  ('agence-immobiliere', 'Agences immobilières', ARRAY['agence immobilière'], 9, true),
  ('salle-reception', 'Salles de réception', ARRAY['salle de réception','domaine mariage'], 9, true),
  ('photographe', 'Photographes professionnels', ARRAY['photographe professionnel'], 8, true)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  query_terms = EXCLUDED.query_terms,
  lead_value_score = EXCLUDED.lead_value_score,
  active = true;
