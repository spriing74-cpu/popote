import type { Unit } from './types';

export interface ReceiptLine {
  raw: string;
  /** Libellé nettoyé (sans prix ni codes). */
  label: string;
  /** Nombre d'articles (« 2 x 1,25 »), 1 par défaut. */
  count: number;
  /** Quantité lue dans le libellé ou sur une ligne de pesée (« 500G », « 0,532 kg »). */
  qty: number | null;
  unit: Unit | null;
  price: number | null;
}

// Lignes qui ne sont pas des articles.
const NOISE =
  /(sous[ -]?total|total|tva|t\.v\.a|\bht\b|\bttc\b|carte|\bcb\b|visa|mastercard|contact|esp[eè]ces|rendu|monnaie|merci|bienvenue|ticket|caisse|caissier|h[oô]tesse|siret|siren|\btel\b|t[ée]l[ée]phone|www|http|avantage|remise|r[ée]duction|fid[ée]lit[ée]|cagnotte|points|nombre d.articles|articles?\s*:|montant|net a payer|[àa] payer|bon d.achat|horaires|ouvert|magasin|\bsa\b|capital|rcs|transaction|autoris|\bdate\b|\bheure\b|client|re[çc]u|a conserver|[ée]change|rembours|leclerc|auchan|lidl|carrefour|intermarch|super ?u\b|hyper ?u\b|casino|monoprix|franprix|netto|aldi|\bcora\b|match\b|grand frais)/i;

// Prix en fin de ligne, éventuellement suivi d'un code TVA (lettre ou chiffre : « 1.36 1 » chez E.Leclerc).
const PRICE_END = /(-?\d{1,4}[,.]\d{2})\s*(?:€|eur|e)?\s*(?:[a-z*]|\d{1,2})?\s*$/i;
/** Fin de la liste d'articles : ce qui suit (paiement, avantages, jeux) n'est jamais un article. */
const END_OF_ITEMS = /^(sous[ -]?)?total\b|^net [àa] payer|^reste [àa] payer|^montant d[ûu]|^[àa] payer\b/i;
const EXTRA_NOISE = /\bbons?\s+imm|\bcumul\b|\bvignettes?\b|\bjetons?\b|\bsolde\b/i;
const WEIGH_LINE = /^\s*(\d+[,.]\d{1,3})\s*kg\s*[x*]\s*(\d+[,.]\d{2})/i;
const COUNT_LINE = /^\s*(\d{1,2})\s*[x*]\s*(\d+[,.]\d{2})/i;
const QTY_IN_LABEL = /(\d+(?:[,.]\d+)?)\s*(kg|g|gr|cl|ml|l)\b/i;
/** Lot : « 3X200G », « 4X150G » → 3 × 200 g. */
const PACK_IN_LABEL = /\b(\d{1,2})\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(kg|g|gr|cl|ml|l)\b/i;
/** Volume tronqué par la caisse : « BTE 50C » = 50 cl. */
const TRUNCATED_CL = /\b(\d{2,3})\s*c\b/i;
const MULTI_IN_LABEL = /\bx\s?(\d{1,2})\b|\b(\d{1,2})\s?x\b/i;

const INLINE_MULTI = /\s(\d{1,2})\s*[x×*]\s*\d+[,.]\d{2}\s*(?:€|eur)?\s*$/i;
const QTE = /\bqu?a?n?t[ée]?t?[ée]?\s*:?\s*(\d{1,2})\b/i;
const UNIT_PRICE = /\d+[,.]\d{2}\s*(?:€|eur)?\s*\/\s*(?:kg|l|litre|pc|pi[eè]ce|u|unit[ée])\b/gi;

const num = (s: string) => parseFloat(s.replace(',', '.'));

function unitOf(u: string): Unit {
  const l = u.toLowerCase();
  if (l === 'gr') return 'g';
  return l as Unit;
}

/** Extrait les articles probables d'un texte de ticket de caisse (issu de l'OCR). */
export function parseReceipt(text: string): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  /** Articles complétés par une ligne de pesée ou de quantité. */
  const completed = new Set<ReceiptLine>();
  const lines = text
    .split(/\r?\n/)
    // Confusions d'OCR fréquentes au contact des chiffres : « 2@CL » → « 20CL », « 1OOOG » → « 1000G ».
    .map((l) => l.replace(/(?<=\d[@oO]*)[@oO](?=[@oO]*\s?(?:kg|g|gr|cl|ml|l)\b)/gi, '0').replace(/(?<=\d)[@oO](?=\d)/g, '0'))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  /** Prix total en bout de ligne de pesée / de quantité (« 2 X 1.97€ 3.94 1 »), s'il est distinct du prix unitaire. */
  const totalAfter = (raw: string, head: RegExpMatchArray): number | null => {
    const tail = raw.match(PRICE_END);
    return tail && tail.index !== undefined && tail.index >= head[0].length ? num(tail[1]) : null;
  };
  for (const raw of lines) {
    if (END_OF_ITEMS.test(raw) && out.length) break;
    // Ligne de pesée ou de multiplicité : complète l'article précédent.
    const weigh = raw.match(WEIGH_LINE);
    if (weigh && out.length) {
      const prev = out[out.length - 1];
      prev.qty = num(weigh[1]);
      prev.unit = 'kg';
      prev.price ??= totalAfter(raw, weigh);
      completed.add(prev);
      continue;
    }
    const cnt = raw.match(COUNT_LINE);
    if (cnt && out.length && !/[a-z]{3,}/i.test(raw.replace(COUNT_LINE, ''))) {
      const prev = out[out.length - 1];
      prev.count = parseInt(cnt[1], 10);
      prev.price ??= totalAfter(raw, cnt);
      completed.add(prev);
      continue;
    }
    if (NOISE.test(raw) || EXTRA_NOISE.test(raw)) continue;
    const letters = raw.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length < 3) continue;

    const priceMatch = raw.match(PRICE_END);
    const price = priceMatch ? num(priceMatch[1]) : null;
    if (price !== null && price < 0) continue; // remise
    let label = priceMatch ? raw.slice(0, priceMatch.index).trim() : raw;
    // Codes article / quantités en tête (« 3017620 », « 2 x »).
    let count = 1;
    const lead = label.match(/^(\d{1,2})\s*[x*]\s+/i);
    if (lead) {
      count = parseInt(lead[1], 10);
      label = label.slice(lead[0].length);
    }
    // Tickets PDF / drive : « Libellé 2 x 1,25 € 2,50 € », « Qté : 2 », prix au kilo en colonne.
    const inline = label.match(INLINE_MULTI);
    if (inline) {
      count = parseInt(inline[1], 10);
      label = label.slice(0, inline.index).trim();
    }
    const qte = label.match(QTE);
    if (qte) {
      count = parseInt(qte[1], 10);
      label = label.replace(QTE, ' ').trim();
    }
    label = label.replace(UNIT_PRICE, ' ');
    label = label.replace(/^\d{4,}\s*/, '').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (label.replace(/[^a-zA-ZÀ-ÿ]/g, '').length < 3) continue;

    let qty: number | null = null;
    let unit: Unit | null = null;
    const pack = label.match(PACK_IN_LABEL);
    const q = label.match(QTY_IN_LABEL);
    const cl = label.match(TRUNCATED_CL);
    if (pack) {
      qty = parseInt(pack[1], 10) * num(pack[2]);
      unit = unitOf(pack[3]);
    } else if (q) {
      qty = num(q[1]);
      unit = unitOf(q[2]);
    } else if (cl) {
      qty = num(cl[1]);
      unit = 'cl';
    }
    const multi = label.match(MULTI_IN_LABEL);
    if (multi && count === 1) count = parseInt(multi[1] ?? multi[2], 10);
    out.push({ raw, label, count, qty, unit, price });
  }
  // Une ligne sans prix n'est un article que si une ligne de pesée ou de quantité l'a complétée
  // (sinon c'est un en-tête, une adresse, un slogan…).
  return out.filter((l) => l.price !== null || completed.has(l));
}

// ---------- Dates de péremption ----------

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, fev: 2, fevr: 2, fevrier: 2, mar: 3, mars: 3, avr: 4, avril: 4, mai: 5, jun: 6, juin: 6,
  jui: 7, juil: 7, juillet: 7, aou: 8, aout: 8, sep: 9, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Cherche des dates plausibles (DLC / DDM) dans un texte OCR d'emballage.
 * Garde les dates entre 7 jours avant et 3 ans après `today`, la plus proche en premier.
 * Les dates « mois/année » (DDM) sont ramenées au dernier jour du mois.
 */
export function parseExpiryDates(text: string, today: string): string[] {
  const t = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0'); // O lu à la place de 0
  const found = new Set<string>();
  // 12/10/2026, 12.10.26, 12-10-26, 12 10 26
  for (const m of t.matchAll(/\b(\d{1,2})\s?[/.\- ]\s?(\d{1,2})\s?[/.\- ]\s?(\d{2}|\d{4})\b/g)) {
    const d = iso(fullYear(+m[3]), +m[2], +m[1]);
    if (d) found.add(d);
  }
  // 12 oct 2026, 12 octobre 26
  for (const m of t.matchAll(/\b(\d{1,2})\s?([a-z]{3,9})\.?\s?(\d{2}|\d{4})\b/g)) {
    const mo = MONTHS[m[2]];
    if (mo) {
      const d = iso(fullYear(+m[3]), mo, +m[1]);
      if (d) found.add(d);
    }
  }
  // 10/2026 ou 10.26 (DDM : fin du mois) — seulement si précédé d'un mot-clé pour éviter les prix
  for (const m of t.matchAll(/(?:ddm|avant|fin|dluo|a consommer de preference)[^0-9]{0,30}(\d{1,2})\s?[/.\-]\s?(\d{4}|\d{2})\b(?!\s?[/.\-]\s?\d)/g)) {
    const y = fullYear(+m[2]);
    const mo = +m[1];
    if (mo >= 1 && mo <= 12) {
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const d = iso(y, mo, last);
      if (d) found.add(d);
    }
  }
  const t0 = Date.parse(today);
  const DAY = 86400000;
  return [...found]
    .filter((d) => {
      const diff = (Date.parse(d) - t0) / DAY;
      return diff >= -7 && diff <= 3 * 365;
    })
    .sort((a, b) => Math.abs(Date.parse(a) - t0) - Math.abs(Date.parse(b) - t0));
}
