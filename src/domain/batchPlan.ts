import type { Catalog, Day, Profile, ProfileId, Recipe, SlotId, WeekPlan } from './types';
import type { Equipment } from './equipment';
import { cookingPlanFor, dinerConsumption, type ConsumptionLine } from './portions';
import { PROFILE_IDS, slotIds } from './week';
import { checkFreshness } from './freshness';

// Plan minuté d'une session de batch cooking : dans quel ordre lancer les plats pour que
// le temps passif (four, mijotage) se chevauche, sans dépasser les appareils disponibles.

export type Appliance = 'four' | 'plaques' | 'airfryer' | 'aucun';

export const APPLIANCE_LABELS: Record<Appliance, string> = { four: 'four', plaques: 'plaques', airfryer: 'airfryer', aucun: 'plan de travail' };

/** Appareil principal d'une recette, d'après ses étapes. */
export function applianceOf(recipe: Recipe, hasAirfryer = false): Appliance {
  const text = recipe.steps.join(' ').toLowerCase();
  if (/\bfour\b|°c|gratin|enfourn|rôtir|rotir/.test(text)) {
    // Airfryer seulement si la recette le propose et qu'on en a un, et qu'elle n'a pas besoin du four.
    if (hasAirfryer && /airfryer/.test(text) && !/\bfour\b/.test(text.replace(/\(.*?airfryer.*?\)/g, ''))) return 'airfryer';
    return 'four';
  }
  if (hasAirfryer && /airfryer/.test(text)) return 'airfryer';
  if (/poêle|poele|casserole|cocotte|faire revenir|mijot|dorer|cuire|bouillir|sauter|fondre|wok/.test(text)) return 'plaques';
  return 'aucun';
}

/** Durées de cuisson des accompagnements (minutes) : préparation active, puis cuisson. */
const SIDE_TIMES: Record<string, { active: number; passive: number; appliance: Appliance }> = {
  riz: { active: 5, passive: 15, appliance: 'plaques' },
  pates: { active: 5, passive: 12, appliance: 'plaques' },
  pdt_vapeur: { active: 10, passive: 20, appliance: 'plaques' },
  pdt_four: { active: 10, passive: 35, appliance: 'four' },
  semoule: { active: 5, passive: 5, appliance: 'aucun' },
  boulgour: { active: 5, passive: 12, appliance: 'plaques' },
  frites: { active: 5, passive: 25, appliance: 'four' },
  nouilles: { active: 3, passive: 5, appliance: 'plaques' },
  quinoa: { active: 5, passive: 15, appliance: 'plaques' },
  haricots_verts: { active: 5, passive: 10, appliance: 'plaques' },
  brocoli: { active: 5, passive: 8, appliance: 'plaques' },
  riz_legumes: { active: 10, passive: 15, appliance: 'plaques' },
  pates_legumes: { active: 10, passive: 12, appliance: 'plaques' },
  salade_verte: { active: 5, passive: 0, appliance: 'aucun' },
};

export interface BatchTask {
  id: string;
  kind: 'plat' | 'accompagnement';
  name: string;
  recipeId?: string;
  sourceSlot?: SlotId;
  /** Nombre de repas servis. */
  servings: number;
  appliance: Appliance;
  active: number;
  passive: number;
  /** Début et fin (minutes depuis le début de la session). */
  start: number;
  applianceFrom: number;
  end: number;
  lines: ConsumptionLine[];
  /** Repas servis, pour étiqueter les boîtes. */
  servedSlots: SlotId[];
}

export interface BatchStep {
  at: number;
  taskId: string;
  kind: 'preparer' | 'cuisson' | 'fin';
  text: string;
  /** Minuteur proposé (minutes). */
  timer?: number;
}

export interface BatchPlan {
  day: Day;
  tasks: BatchTask[];
  steps: BatchStep[];
  /** Fin de la dernière cuisson. */
  cookingEnd: number;
  /** Durée totale, refroidissement et mise en boîtes compris. */
  total: number;
  /** Actif en cuisine (somme des temps actifs). */
  activeTotal: number;
  boxes: { slot: SlotId; recipeId: string; diners: ProfileId[]; freeze: boolean }[];
}

const CAPACITY: Record<Appliance, number> = { four: 2, plaques: 3, airfryer: 1, aucun: 99 };
const PORTIONING = 20;

/**
 * Ordonnancement glouton : les plats au plus long temps passif d'abord ; un seul cuisinier
 * (les temps actifs ne se chevauchent pas) ; four 2 plats, 3 feux, 1 airfryer.
 * Four et airfryer sont occupés après la préparation ; les plaques dès le début.
 */
export function batchPlan(catalog: Catalog, plan: WeekPlan, profiles: Record<ProfileId, Profile>, day: Day, equipment: Equipment[] = []): BatchPlan {
  const hasAirfryer = equipment.some((e) => e.kind === 'airfryer');
  const raw: Omit<BatchTask, 'start' | 'applianceFrom' | 'end'>[] = [];
  const sideAgg = new Map<string, { servings: number; lines: ConsumptionLine[]; slots: SlotId[] }>();
  const boxes: BatchPlan['boxes'] = [];

  for (const id of slotIds(plan)) {
    if (plan.slots[id].prepDay !== day) continue;
    const c = cookingPlanFor(catalog, plan, profiles, id);
    if (!c || c.servings === 0) continue;
    const recipe = catalog.recipes[c.recipeId];
    // Plus de portions = un peu plus de préparation (éplucher, couper).
    const active = Math.round(recipe.activeMin * (c.servings > 4 ? 1 + Math.min(0.5, (c.servings - 4) * 0.06) : 1));
    raw.push({
      id: `plat:${id}`,
      kind: 'plat',
      name: recipe.name,
      recipeId: recipe.id,
      sourceSlot: id,
      servings: c.servings,
      appliance: applianceOf(recipe, hasAirfryer),
      active,
      passive: Math.max(0, recipe.totalMin - recipe.activeMin),
      lines: c.lines,
      servedSlots: c.servedSlots,
    });
    for (const s of c.servedSlots) {
      const diners = PROFILE_IDS.filter((p) => plan.slots[s].diners[p].present);
      if (diners.length) boxes.push({ slot: s, recipeId: recipe.id, diners, freeze: checkFreshness(catalog, plan, s)?.status === 'congeler' });
      for (const p of PROFILE_IDS) {
        for (const l of dinerConsumption(catalog, plan, profiles, s, p).filter((x) => x.origin === 'accompagnement')) {
          const sideId = plan.slots[s].diners[p].sideId;
          if (!sideId || !(sideId in SIDE_TIMES)) continue;
          const agg = sideAgg.get(sideId) ?? { servings: 0, lines: [], slots: [] };
          agg.lines.push(l);
          if (!agg.slots.includes(s)) agg.slots.push(s);
          sideAgg.set(sideId, agg);
        }
        const sideId = plan.slots[s].diners[p].sideId;
        const agg = sideId && plan.slots[s].diners[p].present ? sideAgg.get(sideId) : undefined;
        if (agg) agg.servings += 1;
      }
    }
  }
  for (const [sideId, agg] of sideAgg) {
    if (agg.lines.length === 0) continue;
    const t = SIDE_TIMES[sideId];
    raw.push({
      id: `side:${sideId}`,
      kind: 'accompagnement',
      name: catalog.sides[sideId]?.name ?? sideId,
      servings: agg.servings,
      appliance: t.appliance === 'four' && hasAirfryer && sideId === 'frites' ? 'airfryer' : t.appliance,
      active: t.active,
      passive: t.passive,
      lines: agg.lines,
      servedSlots: agg.slots,
    });
  }

  // Plats longs d'abord, accompagnements (qui se réchauffent mal) en dernier.
  raw.sort((a, b) => Number(a.kind === 'accompagnement') - Number(b.kind === 'accompagnement') || b.passive - a.passive || b.active - a.active);

  const busy: Record<Appliance, [number, number][]> = { four: [], plaques: [], airfryer: [], aucun: [] };
  const usage = (ap: Appliance, from: number, to: number) => busy[ap].filter(([s, e]) => s < to && from < e).length;
  let cookFree = 0;
  const tasks: BatchTask[] = [];
  for (const t of raw) {
    const occupiesDuringPrep = t.appliance === 'plaques';
    let start = cookFree;
    for (let guard = 0; guard < 200; guard++) {
      const from = occupiesDuringPrep ? start : start + t.active;
      const to = start + t.active + t.passive;
      if (t.appliance === 'aucun' || to === from || usage(t.appliance, from, to) < CAPACITY[t.appliance]) break;
      start += 5;
    }
    const applianceFrom = occupiesDuringPrep ? start : start + t.active;
    const end = start + t.active + t.passive;
    if (t.appliance !== 'aucun' && end > applianceFrom) busy[t.appliance].push([applianceFrom, end]);
    cookFree = start + t.active;
    tasks.push({ ...t, start, applianceFrom, end });
  }

  const steps: BatchStep[] = [];
  for (const t of tasks) {
    const who = t.kind === 'plat' ? `${t.servings} repas` : `${t.servings} portion${t.servings > 1 ? 's' : ''}`;
    steps.push({
      at: t.start,
      taskId: t.id,
      kind: 'preparer',
      text: t.kind === 'plat' ? `Préparer ${t.name} (${who}) — ${t.active} min actives` : `Lancer ${t.name.toLowerCase()} (${who})`,
      timer: t.appliance === 'plaques' && t.passive === 0 ? t.active : undefined,
    });
    if (t.passive > 0) {
      const where = t.appliance === 'four' ? 'Au four' : t.appliance === 'airfryer' ? 'Dans l’airfryer' : t.appliance === 'plaques' ? 'Sur le feu' : 'Repos';
      steps.push({ at: t.start + t.active, taskId: t.id, kind: 'cuisson', text: `${where} : ${t.name} — ${t.passive} min`, timer: t.passive });
    }
    steps.push({ at: t.end, taskId: t.id, kind: 'fin', text: `${t.name} est prêt : laisser tiédir (moins de 2 h avant le frigo)` });
  }
  steps.sort((a, b) => a.at - b.at || ['fin', 'cuisson', 'preparer'].indexOf(a.kind) - ['fin', 'cuisson', 'preparer'].indexOf(b.kind));
  const cookingEnd = tasks.reduce((m, t) => Math.max(m, t.end), 0);
  return {
    day,
    tasks,
    steps,
    cookingEnd,
    total: tasks.length ? cookingEnd + PORTIONING : 0,
    activeTotal: tasks.reduce((s, t) => s + t.active, 0),
    boxes,
  };
}

/** « 1 h 05 », « 45 min » */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
