import { useRef, useState } from 'react';
import type { InventoryItem, PriceEntry, StorageLocation, StoreId, Unit } from '../domain/types';
import { STORE_LABELS, formatEuro } from '../domain/budget';
import { INGREDIENTS } from '../data/ingredients';
import { parseReceipt } from '../domain/receipt';
import { matchReceiptLabel } from '../domain/matching';
import { aliasKey } from '../domain/openfoodfacts';
import { defaultLocation, defaultQuantity, estimateExpiry, todayIso } from '../domain/inventory';
import { loadImage, enhanceForOcr } from '../scan/image';
import { recognizeText } from '../scan/ocr';
import { useCatalog, useStore } from '../state/store';
import { Sheet, uid } from './common';
import { Icon } from './icons';
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
  /** Prix payé pour la ligne (lu sur le ticket). */
  price: number | null;
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
  const [done, setDone] = useState<{ items: number; prices: number } | null>(null);
  const [store, setStore] = useState<StoreId>(state.settings.preferredStore ?? 'leclerc');
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const ocr = async (canvas: HTMLCanvasElement, what: string) =>
    recognizeText(enhanceForOcr(canvas), (p, st) => setProgress(`${what} — ${st} ${Math.round(p * 100)} %`));

  /** Photo, PDF (ticket en ligne) ou texte collé : tout finit en lignes de ticket à valider. */
  const readFiles = async (files: File[]) => {
    setError(null);
    setDone(null);
    try {
      for (const file of files) {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          setProgress(`Lecture du PDF ${file.name}…`);
          const { readPdf } = await import('../scan/pdf');
          const pdf = await readPdf(file);
          if (pdf.text.trim()) ingest(pdf.text, pdf.scannedPages.length === 0);
          for (let i = 0; i < pdf.scannedPages.length; i++) ingest(await ocr(pdf.scannedPages[i], `Page scannée ${i + 1}`), true);
        } else {
          setProgress('Préparation de la photo…');
          ingest(await ocr(await loadImage(file, 2200), 'Lecture'), true);
        }
      }
      setProgress(null);
    } catch {
      setProgress(null);
      setError('Lecture impossible : le moteur de lecture se télécharge à la première utilisation (connexion nécessaire), puis fonctionne hors ligne. Pour un PDF protégé par mot de passe, collez plutôt le texte.');
    }
  };

  const ingest = (text: string, reportEmpty: boolean) => {
      setTexts((t) => [...t, text]);
      const lines = parseReceipt(text);
      if (lines.length === 0) {
        if (reportEmpty) setError('Aucun article reconnu. Pour une photo : ticket à plat, bien éclairé, qui remplit l’écran (plusieurs photos pour un long ticket). Pour un ticket en ligne : essayez « Coller le texte ».');
        return;
      }
      const newRows: Row[] = lines.map((l) => {
        const id = matchReceiptLabel(l.label, catalog, state.aliases);
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
          price: l.price,
        };
      });
      setRows((r) => [...r, ...newRows]);
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
    const prices: PriceEntry[] = [];
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
      // Prix réel payé dans ce magasin : devient une référence pour le budget.
      if (r.ingredientId && r.price !== null && r.price > 0) {
        prices.push({ id: uid(), ingredientId: r.ingredientId, store, price: r.price, perQty: q, perUnit: r.unit, date: today, source: 'ticket' });
      }
      // Apprend l'abréviation du magasin quand l'utilisateur a corrigé ou confirmé la correspondance.
      if (r.ingredientId) aliases[aliasKey(r.label)] = r.ingredientId;
    }
    if (items.length === 0) return;
    dispatch({ type: 'addInventory', items });
    dispatch({ type: 'learnAliases', entries: aliases });
    if (prices.length) dispatch({ type: 'addPrices', entries: prices });
    setDone({ items: items.length, prices: prices.length });
    setRows([]);
    setTexts([]);
  };

  return (
    <Sheet title="Ticket de caisse" onClose={onClose}>
      {done !== null && (
        <p className="note ok">
          ✓ {done.items} produit(s) ajouté(s) au stock{done.prices > 0 && `, ${done.prices} prix enregistré(s) pour ${STORE_LABELS[store]}`}. Dates estimées : corrigez-les dans Frigo si besoin (📷 sur l’emballage).
        </p>
      )}
      <p className="muted small">
        Lecture sur le téléphone, rien n’est envoyé. Vérifiez chaque ligne : Popote retient vos corrections pour la prochaine fois.
      </p>
      <label className="field">
        <span>Magasin du ticket (les prix lus deviennent vos prix de référence)</span>
        <select value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
          {(Object.keys(STORE_LABELS) as StoreId[]).map((s) => (
            <option key={s} value={s}>
              {STORE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="source-tiles">
        <button className="source-tile" onClick={() => cameraRef.current?.click()} disabled={!!progress}>
          <span className="tile-icon row-icon">
            <Icon name="camera" size={18} />
          </span>
          <span>
            <b>{rows.length ? 'Photographier la suite' : 'Photographier le ticket'}</b>
            <span className="small">Ticket papier, à plat et bien éclairé</span>
          </span>
        </button>
        <button className="source-tile" onClick={() => fileRef.current?.click()} disabled={!!progress}>
          <span className="tile-icon row-icon" style={{ background: '#2f80ed' }}>
            <Icon name="file" size={18} />
          </span>
          <span>
            <b>Importer un PDF ou une image</b>
            <span className="small">Ticket web, commande drive, capture d’écran, photo de la galerie</span>
          </span>
        </button>
        <button className="source-tile" onClick={() => setPasting((v) => !v)} disabled={!!progress}>
          <span className="tile-icon row-icon" style={{ background: '#1f9d55' }}>
            <Icon name="clipboard" size={18} />
          </span>
          <span>
            <b>Coller le texte</b>
            <span className="small">Ticket reçu par e-mail : copiez le détail des articles</span>
          </span>
        </button>
      </div>
      {pasting && (
        <div className="card">
          <textarea rows={6} value={pasted} placeholder={'Filets de poulet 2 x 5,49 € 10,98 €\nCourgettes 2,49 €'} onChange={(e) => setPasted(e.target.value)} />
          <button
            className="btn primary block"
            disabled={!pasted.trim()}
            onClick={() => {
              setError(null);
              setDone(null);
              ingest(pasted, true);
              setPasted('');
              setPasting(false);
            }}
          >
            Lire ce texte
          </button>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFiles([f]);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          if (fs.length) readFiles(fs);
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
                    {r.price !== null && <span className="muted small"> · {formatEuro(r.price)}</span>}
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
