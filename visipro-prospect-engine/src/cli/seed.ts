import { db } from "../db.js";
const zones = ["Orléans","Jargeau","Châteauneuf-sur-Loire","Saint-Denis-de-l'Hôtel","Olivet","Fleury-les-Aubrais","Gien","Montargis"];
for (const name of zones) await db.query("INSERT INTO search_zones(name) VALUES($1) ON CONFLICT DO NOTHING", [name]);
const categories = [
  ["electricien","Électriciens",["électricien","dépannage électrique"],9],
  ["plombier","Plombiers",["plombier","dépannage plomberie"],9],
  ["couvreur","Couvreurs",["couvreur","entreprise de couverture"],9],
  ["chauffagiste","Chauffagistes / climatisation",["chauffagiste","climatisation"],9],
  ["menuisier","Menuisiers",["menuisier","menuiserie"],8]
];
for (const [slug,label,terms,value] of categories) await db.query("INSERT INTO search_categories(slug,label,query_terms,lead_value_score) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO UPDATE SET label=excluded.label,query_terms=excluded.query_terms", [slug,label,terms,value]);
console.log(`Seeded ${zones.length} zones and ${categories.length} categories`); await db.end();
