// Appels au service IA personnel (Cloudflare Worker de l'utilisateur, voir /worker).
// La clé API Anthropic reste dans le Worker : l'application n'envoie que la photo ou la référence.
import type { EquipmentAiInfo, EquipmentKind } from '../domain/equipment';

export interface IdentifyResult {
  kind: EquipmentKind;
  brand: string | null;
  model: string | null;
  confidence: 'haute' | 'moyenne' | 'faible';
  visibleText: string;
  notes: string;
}

export class AiServiceError extends Error {}

async function post<T>(base: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!base) throw new AiServiceError('Service IA non configuré (Réglages › Ma cuisine › Service IA).');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiServiceError('Pas de connexion : l’IA a besoin d’internet.');
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AiServiceError((e as Error).name === 'TimeoutError' ? 'Le service IA a mis trop de temps à répondre.' : 'Service IA injoignable (adresse ou connexion ?).');
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok || !data) throw new AiServiceError(data?.error ?? `Erreur du service IA (${res.status}).`);
  return data as T;
}

/** Photo de l'appareil (canvas réduit) → type, marque, modèle probables. */
export async function identifyAppliance(base: string, canvas: HTMLCanvasElement): Promise<IdentifyResult> {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return post<IdentifyResult>(base, '/identify', { image: dataUrl.split(',')[1], mediaType: 'image/jpeg' }, 60_000);
}

/** Recherche de la notice et des réglages recommandés pour un modèle précis. */
export async function fetchApplianceSettings(
  base: string,
  appliance: { kind: EquipmentKind; brand: string; model: string },
): Promise<EquipmentAiInfo> {
  const r = await post<Omit<EquipmentAiInfo, 'fetchedAt'>>(base, '/settings', appliance, 180_000);
  return { ...r, fetchedAt: new Date().toISOString().slice(0, 10) };
}
