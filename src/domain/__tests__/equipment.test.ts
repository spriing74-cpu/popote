import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../data/catalog';
import { adviceFor, cookingHints, parseRatingPlate, type Equipment } from '../equipment';
import { normalizeState, exportJson, parseImport } from '../../state/persistence';
import { defaultState } from '../../data/defaults';

const base = { brand: '', model: '', notes: '' };
const four: Equipment = { ...base, id: 'f', kind: 'four', brand: 'Bosch', model: 'HBA5570S0', convection: true, maxTempC: 275 };
const air: Equipment = { ...base, id: 'a', kind: 'airfryer', brand: 'Ninja', model: 'AF100EU', basketLiters: 3.8, maxTempC: 200 };
const mo: Equipment = { ...base, id: 'm', kind: 'microondes', watts: 1000 };
const cookeo: Equipment = { ...base, id: 'c', kind: 'autocuiseur', brand: 'Moulinex', model: 'Cookeo' };

describe('plaque signalétique', () => {
  it('trouve la marque et la référence, en ignorant tensions et puissances', () => {
    const text = 'BOSCH\nE-Nr. HBA5570S0/45 FD 9801\nTyp HBD73AB0\n220-240V 50Hz 3600W\nMade in Spain';
    const r = parseRatingPlate(text);
    expect(r.brand).toBe('Bosch');
    expect(r.models[0]).toBe('HBA5570S0/45');
    expect(r.models).toContain('HBD73AB0');
    expect(r.models.some((m) => /V$|HZ$|W$/.test(m))).toBe(false);
  });

  it('reconnaît une plaque d’airfryer', () => {
    const r = parseRatingPlate('NINJA\nModel: AF100EU\n1550W 220-240V~');
    expect(r).toEqual({ brand: 'Ninja', models: ['AF100EU'] });
  });
});

describe('adaptation des réglages', () => {
  it('lit températures et durées dans les étapes', () => {
    const h = cookingHints(CATALOG.recipes.gratin_dauphinois_jambon);
    expect(h.ovenTemps).toContain(160);
    expect(h.wetDish).toBe(true);
  });

  it('four à chaleur tournante : −20 °C', () => {
    const [a] = adviceFor(CATALOG.recipes.poulet_roti_pdt, [four]);
    expect(a.title).toBe('Bosch HBA5570S0');
    expect(a.lines[0]).toContain('chaleur tournante 180 °C');
    // La température « airfryer » de l'étape n'est pas prise pour une température de four
    expect(adviceFor(CATALOG.recipes.poulet_pilons_miel, [four])[0].lines).toHaveLength(1);
  });

  it('airfryer : température plafonnée, durée réduite, nombre de fournées selon le panier', () => {
    const [a] = adviceFor(CATALOG.recipes.poulet_pilons_miel, [air], 4);
    expect(a.lines[0]).toMatch(/Environ 180 °C, 30 min au lieu de 40/);
    expect(a.lines.join(' ')).toMatch(/Panier de 3,8 L : environ 2 portion\(s\) par fournée — prévoir 2 fournées pour 4/);
  });

  it('airfryer : met en garde pour les plats liquides', () => {
    const [a] = adviceFor(CATALOG.recipes.lasagnes_bolognaise, [air]);
    expect(a.lines.join(' ')).toMatch(/moule qui tient dans le panier/);
  });

  it('micro-ondes pour les plats à réchauffer, autocuiseur pour les mijotés', () => {
    const [m] = adviceFor(CATALOG.recipes.chili_con_carne, [mo]);
    expect(m.lines[0]).toMatch(/2 min à 1000 W/);
    const [c] = adviceFor(CATALOG.recipes.boeuf_bourguignon, [cookeo]);
    expect(c.lines[0]).toMatch(/Sous pression : environ 60 min au lieu de 180/);
    // Pas de conseil hors sujet : micro-ondes pour une salade froide
    expect(adviceFor(CATALOG.recipes.salade_pates_thon, [mo])).toEqual([]);
  });

  it('utilise les réglages trouvés par l’IA quand le plat correspond', () => {
    const withAi: Equipment = {
      ...four,
      ai: {
        summary: '',
        functions: [],
        maxTempC: 275,
        capacity: null,
        dishSettings: [{ dish: 'Gratin', mode: 'Air pulsé 3D', tempC: 170, timeMin: '40-50 min', notes: 'Niveau 2' }],
        tips: [],
        sources: [{ title: 'Notice', url: 'https://example.org/notice.pdf' }],
        caveats: '',
        fetchedAt: '2026-09-26',
      },
    };
    const [a] = adviceFor(CATALOG.recipes.gratin_dauphinois_jambon, [withAi]);
    expect(a.fromAi).toBe(true);
    expect(a.lines.join(' ')).toMatch(/Air pulsé 3D, 170 °C, 40-50 min/);
  });
});

describe('sauvegarde des équipements', () => {
  it('survit à l’export / import et rejette une adresse IA non HTTPS', () => {
    const s = { ...defaultState(), equipment: [four, air], settings: { ...defaultState().settings, aiServiceUrl: 'https://popote-ia.exemple.workers.dev' } };
    const back = parseImport(exportJson(s), CATALOG);
    expect(back.equipment).toHaveLength(2);
    expect(back.equipment[0].model).toBe('HBA5570S0');
    expect(back.settings.aiServiceUrl).toBe('https://popote-ia.exemple.workers.dev');
    const bad = normalizeState({ settings: { aiServiceUrl: 'http://evil.example' }, equipment: [{ kind: 'fusée' }] }, CATALOG);
    expect(bad.settings.aiServiceUrl).toBe('');
    expect(bad.equipment).toEqual([]);
  });
});
