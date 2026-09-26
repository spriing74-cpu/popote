import { useRef, useState } from 'react';
import type { InventoryItem, StorageLocation, Unit } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { parseReceipt } from '../domain/receipt';
import { bestMatch } from '../domain/matching';
import { aliasKey } from '../domain/openfoodfacts';
import { defaultLocation, defaultQuantity, estimateExpiry, todayIso } from '../domain/inventory';
import { loadImage, enhanceForOcr } from '../scan/image';
import { recognizeText } from '../scan/ocr';
import { useCatalog, useStore } from '../state/store';
import { Sheet, uid } from './common';
import { LOCATION_LABELS, unitsFor } from './ItemForm';

interface Row {
  key: string;
  include: boolean;
  raw: string;
  label: string;
  ingredientId: string | null;
  autoMatched: boolean;
  qty: string;
  unit: Unit;
  location: StorageLocation;
  expiry: string;
}

const INGREDIENT_OPTIONS = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

/** Photo(s) du ticket → lecture sur l'appareil → validation ligne par ligne → stock. */
export function ReceiptScanner({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const today = todayIso();
  const [rows, setRows] = useState<Row[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readPhoto = async (file: File) => {
    setError(null);
    setDone(null);
    try {
      setProgress('Préparation de la photo…');
      const canvas = enhanceForOcr(await loadImage(file, 2200));
      const text = await recognizeText(canvas, (p, s) => setProgress(`${s} ${Math.round(p * 100)} %`));
      setProgress(null);
      setTexts((t) => [...t, text]);
      const lines = parseReceipt(text);
      if (lines.length === 0) {
        setError('Aucun article reconnu. Photographiez le ticket à plat, bien éclairé, en remplissant l’écran (plusieurs photos pour un long ticket).');
        return;
      }
      const newRows: Row[] = lines.map((l) => {
        const id = bestMatch(l.label, catalog, state.aliases);
        const q = defaultQuantity(catalog, id, l.count, l.qty, l.unit);
        const loc = defaultLocation(id);
        return {
          key: uid(),
          include: id !== null,
          raw: l.raw,
          label: l.label,
          ingredientId: id,
          autoMatched: id !== null,
          qty: String(Math.round(q.qty * 100) / 100).replace('.', ','),
          unit: q.unit,
          location: loc,
          expiry: estimateExpiry(id, loc, today),
        };
      });
      setRows((r) => [...r, ...newRows]);
    } catch {
      setProgress(null);
      setError('Lecture impossible : le moteur de lecture se télécharge à la première utilisation (connexion nécessaire), puis fonctionne hors ligne.');
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const setIngredient = (row: Row, id: string | null) => {
    const units = unitsFor(id);
    const loc = defaultLocation(id);
    const q = defaultQuantity(catalog, id, 1, null, null);
    update(row.key, {
      ingredientId: id,
      include: id !== null || row.include,
      unit: units.includes(row.unit) ? row.unit : q.unit,
      qty: units.includes(row.unit) ? row.qty : String(q.qty).replace('.', ','),
      location: loc,
      expiry: estimateExpiry(id, loc, today),
    });
  };

  const selected = rows.filter((r) => r.include);

  const commit = () => {
    const items: InventoryItem[] = [];
    const aliases: Record<string, string> = {};
    for (const r of selected) {
      const q = parseFloat(r.qty.replace(',', '.'));
      if (!(q > 0)) continue;
      items.push({
        id: uid(),
        ingredientId: r.ingredientId,
        label: r.ingredientId ? INGREDIENTS[r.ingredientId].name : r.label,
        qty: q,
        unit: r.unit,
        expiry: r.expiry || null,
        expirySource: r.expiry ? 'estimee' : 'aucune',
        location: r.location,
        addedAt: today,
      });
      // Apprend l'abréviation du magasin quand l'utilisateur a corrigé ou confirmé la correspondance.
      if (r.ingredientId) aliases[aliasKey(r.label)] = r.ingredientId;
    }
    if (items.length === 0) return;
    dispatch({ type: 'addInventory', items });
    dispatch({ type: 'learnAliases', entries: aliases });
    setDone(items.length);
    setRows([]);
    setTexts([]);
  };

  return (
    <Sheet title="Scanner un ticket" onClose={onClose}>
      {done !== null && <p className="note ok">✓ {done} produit(s) ajouté(s) au stock. Dates estimées : corrigez-les dans Frigo si besoin (📷 sur l’emballage).</p>}
      <p className="muted small">
        La lecture se fait sur le téléphone, rien n’est envoyé. Les tickets abrègent souvent les noms : vérifiez chaque ligne, l’app retiendra vos corrections pour la prochaine fois.
      </p>
      <button className="btn primary block" onClick={() => fileRef.current?.click()} disabled={!!progress}>
        📷 {rows.length ? 'Ajouter une photo (suite du ticket)' : 'Photographier le ticket'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readPhoto(f);
          e.target.value = '';
        }}
      />
      {progress && <p className="note info">{progress}</p>}
      {error && <p className="note trop_long">{error}</p>}

      {rows.length > 0 && (
        <>
          <h3>
            {rows.length} ligne(s) lue(s) · {selected.length} à ajouter
          </h3>
          <ul className="receipt-list">
            {rows.map((r) => (
              <li key={r.key} className={r.include ? 'receipt-row' : 'receipt-row off'}>
                <label className="check-line">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} />
                  <span>
                    <span className="mono">{r.label}</span>
                    {!r.ingredientId && <span className="badge trop_long">non reconnu</span>}
                    {r.autoMatched && <span className="badge info">reconnu</span>}
                  </span>
                </label>
                {r.include && (
                  <div className="receipt-edit">
                    <select value={r.ingredientId ?? ''} onChange={(e) => setIngredient(r, e.target.value || null)}>
                      <option value="">— Autre produit —</option>
                      {INGREDIENT_OPTIONS.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <div className="row gap wrap">
                      <input className="narrow" inputMode="decimal" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} aria-label="Quantité" />
                      <select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value as Unit })} aria-label="Unité">
                        {unitsFor(r.ingredientId).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <select
                        value={r.location}
                        aria-label="Rangement"
                        onChange={(e) => {
                          const loc = e.target.value as StorageLocation;
                          update(r.key, { location: loc, expiry: estimateExpiry(r.ingredientId, loc, today) });
                        }}
                      >
                        {(Object.keys(LOCATION_LABELS) as StorageLocation[]).map((l) => (
                          <option key={l} value={l}>
                            {LOCATION_LABELS[l]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="field-inline">
                      <span className="small">À consommer avant (estimée)</span>
                      <input type="date" value={r.expiry} onChange={(e) => update(r.key, { expiry: e.target.value })} />
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button className="btn primary block" onClick={commit} disabled={selected.length === 0}>
            Ajouter {selected.length} produit(s) au stock
          </button>
          <button className="btn-link" onClick={() => setShowText((v) => !v)}>
            {showText ? 'Masquer' : 'Voir'} le texte lu
          </button>
          {showText && <pre className="ocr-text">{texts.join('\n———\n')}</pre>}
        </>
      )}
    </Sheet>
  );
}
