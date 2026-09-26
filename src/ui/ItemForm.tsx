import { useMemo, useRef, useState } from 'react';
import type { InventoryItem, StorageLocation, Unit } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { matchIngredient } from '../domain/matching';
import { parseExpiryDates } from '../domain/receipt';
import { daysLeft, defaultLocation, estimateExpiry, todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { loadImage, enhanceForOcr } from '../scan/image';
import { recognizeText } from '../scan/ocr';
import { Chip, uid } from './common';

export const LOCATION_LABELS: Record<StorageLocation, string> = { frigo: '🧊 Frigo', congelateur: '❄️ Congélateur', placard: '🗄 Placard' };
const INGREDIENT_OPTIONS = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export function unitsFor(ingredientId: string | null): Unit[] {
  const ing = ingredientId ? INGREDIENTS[ingredientId] : null;
  if (!ing) return ['pc', 'g', 'kg', 'ml', 'cl', 'l'];
  if (ing.unit === 'pc') return ing.pieceWeightG ? ['pc', 'g', 'kg'] : ['pc'];
  if (ing.unit === 'ml') return ing.densityGPerMl ? ['ml', 'cl', 'l', 'g'] : ['ml', 'cl', 'l'];
  return ing.pieceWeightG ? ['g', 'kg', 'pc'] : ['g', 'kg'];
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'sans date';
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function expiryLabel(iso: string | null, today: string): string {
  const d = daysLeft(iso, today);
  if (d === null) return 'sans date';
  if (d < 0) return `périmé depuis ${-d} j`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  return `J-${d}`;
}

/** Formulaire d'ajout / modification d'un produit du stock, avec lecture de date sur photo. */
export function ItemForm({
  initial,
  onSave,
  onDelete,
  saveLabel = 'Enregistrer',
}: {
  initial: Partial<InventoryItem>;
  onSave: (item: InventoryItem) => void;
  onDelete?: (reason: 'mange' | 'jete') => void;
  saveLabel?: string;
}) {
  const { state } = useStore();
  const catalog = useCatalog();
  const today = todayIso();
  const [label, setLabel] = useState(initial.label ?? '');
  const [ingredientId, setIngredientId] = useState<string | null>(initial.ingredientId ?? null);
  const [qty, setQty] = useState(String(initial.qty ?? 1).replace('.', ','));
  const [unit, setUnit] = useState<Unit>(initial.unit ?? 'pc');
  const [location, setLocation] = useState<StorageLocation>(initial.location ?? defaultLocation(initial.ingredientId ?? null));
  const [expiry, setExpiry] = useState<string>(initial.expiry ?? estimateExpiry(initial.ingredientId ?? null, initial.location ?? defaultLocation(initial.ingredientId ?? null), today));
  const [expirySource, setExpirySource] = useState<InventoryItem['expirySource']>(initial.expirySource ?? (initial.expiry ? 'emballage' : 'estimee'));
  const [ocrState, setOcrState] = useState<string | null>(null);
  const [dateCandidates, setDateCandidates] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => (label.trim().length >= 3 ? matchIngredient(label, catalog, state.aliases, 4) : []), [label, catalog, state.aliases]);

  const chooseIngredient = (id: string | null) => {
    setIngredientId(id);
    const units = unitsFor(id);
    if (!units.includes(unit)) setUnit(units[0]);
    const loc = defaultLocation(id);
    setLocation(loc);
    if (expirySource !== 'emballage') {
      setExpiry(estimateExpiry(id, loc, today));
      setExpirySource('estimee');
    }
    if (!label.trim() && id) setLabel(INGREDIENTS[id].name);
  };

  const changeLocation = (loc: StorageLocation) => {
    setLocation(loc);
    if (expirySource !== 'emballage' || loc === 'congelateur') {
      setExpiry(estimateExpiry(ingredientId, loc, today));
      setExpirySource('estimee');
    }
  };

  const readDate = async (file: File) => {
    setDateCandidates([]);
    try {
      setOcrState('Préparation de la photo…');
      const canvas = enhanceForOcr(await loadImage(file, 1400));
      const text = await recognizeText(canvas, (p, s) => setOcrState(`${s} ${Math.round(p * 100)} %`));
      const dates = parseExpiryDates(text, today);
      if (dates.length === 0) setOcrState('Aucune date lisible. Rapprochez-vous de la date, bien éclairée, ou saisissez-la.');
      else {
        setOcrState(null);
        setDateCandidates(dates.slice(0, 4));
        setExpiry(dates[0]);
        setExpirySource('emballage');
      }
    } catch {
      setOcrState('Lecture impossible (moteur non chargé : une connexion est nécessaire la première fois).');
    }
  };

  const save = () => {
    const q = parseFloat(qty.replace(',', '.'));
    if (!label.trim() || !(q > 0)) return;
    onSave({
      id: initial.id ?? uid(),
      ingredientId,
      label: label.trim(),
      brand: initial.brand,
      barcode: initial.barcode,
      qty: q,
      unit,
      expiry: expiry || null,
      expirySource: expiry ? expirySource : 'aucune',
      location,
      addedAt: initial.addedAt ?? today,
    });
  };

  return (
    <div className="item-form">
      <label className="field">
        <span>Produit</span>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Filets de poulet" />
      </label>
      {initial.brand && <p className="muted small">Marque : {initial.brand}</p>}

      <div className="field">
        <span>Ingrédient correspondant (pour les recettes et les courses)</span>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => (
              <Chip key={s.ingredientId} active={ingredientId === s.ingredientId} onClick={() => chooseIngredient(s.ingredientId)}>
                {INGREDIENTS[s.ingredientId].name}
              </Chip>
            ))}
          </div>
        )}
        <select value={ingredientId ?? ''} onChange={(e) => chooseIngredient(e.target.value || null)}>
          <option value="">— Autre produit (non utilisé dans les recettes) —</option>
          {INGREDIENT_OPTIONS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span>Quantité</span>
        <div className="row gap">
          <input className="narrow" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {unitsFor(ingredientId).map((u) => (
              <option key={u} value={u}>
                {u === 'pc' ? (ingredientId && INGREDIENTS[ingredientId].pieceLabel) || 'pièce(s)' : u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <span>Rangement</span>
        <div className="chips">
          {(Object.keys(LOCATION_LABELS) as StorageLocation[]).map((l) => (
            <Chip key={l} active={location === l} onClick={() => changeLocation(l)}>
              {LOCATION_LABELS[l]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <span>
          À consommer avant{' '}
          <span className="muted">
            ({expiry ? `${expiryLabel(expiry, today)}${expirySource === 'estimee' ? ', date estimée' : ', date de l’emballage'}` : 'aucune'})
          </span>
        </span>
        <input
          type="date"
          value={expiry}
          onChange={(e) => {
            setExpiry(e.target.value);
            setExpirySource('emballage');
          }}
        />
        <div className="row gap wrap">
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            📷 Lire la date sur l’emballage
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setExpiry(estimateExpiry(ingredientId, location, today));
              setExpirySource('estimee');
            }}
          >
            Estimer
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readDate(f);
            e.target.value = '';
          }}
        />
        {ocrState && <p className="note info">{ocrState}</p>}
        {dateCandidates.length > 1 && (
          <div className="chips">
            {dateCandidates.map((d) => (
              <Chip key={d} active={expiry === d} onClick={() => setExpiry(d)}>
                {formatDate(d)}
              </Chip>
            ))}
          </div>
        )}
        {dateCandidates.length > 0 && <p className="muted small">Date lue automatiquement : vérifiez-la.</p>}
      </div>

      <button className="btn primary block" onClick={save} disabled={!label.trim()}>
        {saveLabel}
      </button>
      {onDelete && (
        <div className="row gap">
          <button className="btn grow" onClick={() => onDelete('mange')}>
            ✓ Consommé
          </button>
          <button className="btn danger grow" onClick={() => onDelete('jete')}>
            Jeté
          </button>
        </div>
      )}
    </div>
  );
}
