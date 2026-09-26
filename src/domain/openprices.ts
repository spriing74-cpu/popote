// Open Prices (Open Food Facts) : prix relevés et partagés par des particuliers, avec photo du ticket
// ou de l'étiquette comme preuve. Données ouvertes (ODbL), consultables sans clé.
const API = 'https://prices.openfoodfacts.org/api/v1/prices';

export interface OpenPrice {
  price: number;
  currency: string;
  date: string;
  store: string;
  city: string;
  distanceKm: number | null;
  pricePer: string | null;
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export const CASTRES: Place = { label: 'Castres', lat: 43.606, lon: 2.241 };

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface RawPrice {
  price?: number;
  currency?: string;
  date?: string;
  price_per?: string | null;
  location?: { osm_name?: string; osm_brand?: string; osm_address_city?: string; osm_lat?: number; osm_lon?: number } | null;
}

export function toOpenPrices(items: RawPrice[], near: Place): OpenPrice[] {
  return items
    .filter((p) => typeof p.price === 'number' && p.date && (p.currency ?? 'EUR') === 'EUR')
    .map((p) => {
      const loc = p.location ?? {};
      const hasPos = typeof loc.osm_lat === 'number' && typeof loc.osm_lon === 'number';
      return {
        price: p.price!,
        currency: p.currency ?? 'EUR',
        date: p.date!,
        store: loc.osm_brand || loc.osm_name || 'Magasin',
        city: loc.osm_address_city ?? '',
        distanceKm: hasPos ? Math.round(distanceKm(near, { lat: loc.osm_lat!, lon: loc.osm_lon! })) : null,
        pricePer: p.price_per ?? null,
      };
    });
}

export interface OpenPricesSummary {
  /** Prix relevés dans le rayon choisi, du plus récent au plus ancien. */
  nearby: OpenPrice[];
  /** Relevé le plus récent en France si rien n'est proche. */
  latestElsewhere: OpenPrice | null;
  total: number;
}

export function summarize(prices: OpenPrice[], radiusKm = 40): OpenPricesSummary {
  const sorted = [...prices].sort((a, b) => b.date.localeCompare(a.date));
  const nearby = sorted.filter((p) => p.distanceKm !== null && p.distanceKm <= radiusKm).slice(0, 5);
  return { nearby, latestElsewhere: nearby.length ? null : sorted[0] ?? null, total: prices.length };
}

export async function fetchOpenPrices(barcode: string, near: Place, fetchImpl: typeof fetch = fetch): Promise<OpenPricesSummary | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  try {
    const res = await fetchImpl(`${API}?product_code=${barcode}&order_by=-date&size=100`);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: RawPrice[] };
    return summarize(toOpenPrices(data.items ?? [], near));
  } catch {
    return null;
  }
}
