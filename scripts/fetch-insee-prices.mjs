// Récupère les prix moyens mensuels INSEE (France métropolitaine) pour les ingrédients de Popote
// et écrit src/data/prix-insee.json. Lancé avant chaque build (GitHub Actions, dont un passage mensuel).
// En cas d'échec réseau, le fichier existant est conservé : le build ne casse jamais.
// Source : INSEE, base BDM, famille « Prix moyens de vente de détail » (licence ouverte Etalab).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'prix-insee.json');

// idbank INSEE → ingrédient Popote. Seules les séries encore mises à jour et équivalentes sont retenues.
const SERIES = {
  '001791255': { ingredientId: 'avocat', label: 'Avocat (pièce)', perQty: 1, perUnit: 'pc' },
  '000641429': { ingredientId: 'tomate', label: 'Tomates (1 kg)', perQty: 1, perUnit: 'kg' },
  '000442423': { ingredientId: 'baguette', label: 'Pain baguette (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641428': { ingredientId: 'poireau', label: 'Poireaux (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641427': { ingredientId: 'oignon', label: 'Oignons (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641422': { ingredientId: 'carotte', label: 'Carottes (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641423': { ingredientId: 'champignon', label: 'Champignons de Paris (1 kg)', perQty: 1, perUnit: 'kg' },
  '000442448': { ingredientId: 'porc_filet', label: 'Porc : rôti dans le filet (1 kg)', perQty: 1, perUnit: 'kg' },
  '001791254': { ingredientId: 'chou_fleur', label: 'Chou-fleur (pièce)', perQty: 1, perUnit: 'pc' },
  '010596274': { ingredientId: 'poivron', label: 'Poivrons (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641434': { ingredientId: 'citron', label: 'Citrons (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641360': { ingredientId: 'pomme_de_terre', label: 'Pommes de terre de conservation (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641367': { ingredientId: 'pomme', label: 'Pommes (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641426': { ingredientId: 'endive', label: 'Endives (1 kg)', perQty: 1, perUnit: 'kg' },
  '000849397': { ingredientId: 'jambon_blanc', label: 'Jambon supérieur (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641432': { ingredientId: 'banane', label: 'Bananes (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641425': { ingredientId: 'courgette', label: 'Courgettes (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641435': { ingredientId: 'clementine', label: 'Clémentines (1 kg)', perQty: 1, perUnit: 'kg' },
  '000442450': { ingredientId: 'porc_echine', label: 'Porc : échine avec os (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641408': { ingredientId: 'merlan', label: 'Filet de merlan (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641418': { ingredientId: 'moules', label: 'Moules de bouchot (1 kg)', perQty: 1, perUnit: 'kg' },
  '000641359': { ingredientId: 'haricots_verts_frais', label: 'Haricots verts (1 kg)', perQty: 1, perUnit: 'kg' },
};

/** Extrait { idbank → { period, value } } d'une réponse SDMX « StructureSpecificData ». */
export function parseSdmx(xml) {
  const result = {};
  for (const m of xml.matchAll(/<Series\b([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const idbank = /IDBANK="([^"]+)"/.exec(m[1])?.[1];
    if (!idbank) continue;
    let best = null;
    for (const o of m[2].matchAll(/<Obs\b([^>]*)\/?>/g)) {
      const period = /TIME_PERIOD="([^"]+)"/.exec(o[1])?.[1];
      const value = Number(/OBS_VALUE="([^"]+)"/.exec(o[1])?.[1]);
      if (period && Number.isFinite(value) && (!best || period > best.period)) best = { period, value };
    }
    if (best) result[idbank] = best;
  }
  return result;
}

async function main() {
  const ids = Object.keys(SERIES).join('+');
  const url = `https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/${ids}?lastNObservations=1`;
  let xml;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    console.warn(`Prix INSEE non mis à jour (${e.message}) : fichier existant conservé.`);
    return;
  }
  const obs = parseSdmx(xml);
  const items = Object.entries(SERIES)
    .filter(([id]) => obs[id])
    .map(([id, s]) => ({ ...s, price: obs[id].value, period: obs[id].period, idbank: id }));
  if (items.length === 0) {
    console.warn('Réponse INSEE vide : fichier existant conservé.');
    return;
  }
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(out, 'utf-8'));
  } catch {
    /* premier passage */
  }
  const data = {
    source: 'INSEE — Prix moyens mensuels de vente au détail en France métropolitaine (licence ouverte Etalab)',
    url: 'https://www.insee.fr/fr/statistiques/series/103157792',
    fetchedAt: new Date().toISOString().slice(0, 10),
    items,
  };
  if (previous && JSON.stringify(previous.items) === JSON.stringify(items)) data.fetchedAt = previous.fetchedAt;
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`Prix INSEE : ${items.length} produits (période ${items[0].period}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
