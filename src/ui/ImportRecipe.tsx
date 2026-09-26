import { useRef, useState } from 'react';
import type { Unit } from '../domain/types';
import type { ImportLine } from '../domain/themealdb';
import { fetchRecipePage, parseRecipeText, proposeLines, toImportedRecipe, type ParsedRecipe } from '../domain/recipeImport';
import { toIngredientUnit } from '../domain/units';
import { enhanceForOcr, loadImage } from '../scan/image';
import { recognizeText } from '../scan/ocr';
import { useCatalog, useStore } from '../state/store';
import { Sheet, Stepper } from './common';
import { Icon } from './icons';
import { unitsFor } from './ItemForm';
import { haptic } from './ios';

type Source = 'lien' | 'photo' | 'texte';

/**
 * Ajouter une recette : lien d'un site (Marmiton, 750g…), photo(s) d'un livre, ou texte collé.
 * Tout est relu avant l'enregistrement : chaque ingrédient est rattaché au catalogue
 * pour que portions, courses et frigo fonctionnent.
 */
export function ImportRecipe({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { state } = useStore();
  const [source, setSource] = useState<Source>('lien');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = (p: ParsedRecipe) => {
    if (p.ingredients.length === 0 && p.steps.length === 0) {
      setStatus('Aucun ingrédient ni étape reconnus. Vérifiez le texte (rubriques « Ingrédients » et « Préparation » de préférence).');
      return;
    }
    haptic('medium');
    setStatus(null);
    setParsed(p);
  };

  const readUrl = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      setStatus('Collez l’adresse complète de la recette (https://…).');
      return;
    }
    setBlocked(false);
    setStatus('Lecture de la page…');
    const r = await fetchRecipePage(u, state.settings.aiServiceUrl);
    if (r === 'bloque') {
      setBlocked(true);
      setStatus(null);
    } else if (r === 'introuvable') setStatus('Cette page ne contient pas de recette lisible. Essayez « Coller le texte ».');
    else accept(r);
  };

  const readPhotos = async (files: File[]) => {
    try {
      const texts: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setStatus(`Préparation de la photo ${i + 1}/${files.length}…`);
        const canvas = enhanceForOcr(await loadImage(files[i], 2200));
        texts.push(await recognizeText(canvas, (p, st) => setStatus(`Photo ${i + 1}/${files.length} — ${st} ${Math.round(p * 100)} %`)));
      }
      setStatus(null);
      setText(texts.join('\n'));
      setSource('texte');
      accept(parseRecipeText(texts.join('\n')));
    } catch {
      setStatus('Lecture impossible : le moteur de lecture se télécharge à la première utilisation (connexion nécessaire).');
    }
  };

  if (parsed) return <ImportReview parsed={parsed} onBack={() => setParsed(null)} onClose={onClose} onSaved={onSaved} />;

  return (
    <Sheet title="Ajouter une recette" onClose={onClose}>
      <div className="source-tiles">
        {(
          [
            { id: 'lien', icon: 'external', title: 'Depuis un lien', text: 'Marmiton, 750g, Cuisine AZ, Ricardo…' },
            { id: 'photo', icon: 'camera', title: 'Depuis une photo', text: 'Page de livre ou fiche papier (plusieurs photos possibles)' },
            { id: 'texte', icon: 'clipboard', title: 'Coller un texte', text: 'Recette reçue par message, notes…' },
          ] as const
        ).map((t) => (
          <button key={t.id} className={source === t.id ? 'source-tile active' : 'source-tile'} onClick={() => (setSource(t.id), setStatus(null))}>
            <span className="tile-icon row-icon">
              <Icon name={t.icon} size={18} />
            </span>
            <span>
              <b>{t.title}</b>
              <span className="small">{t.text}</span>
            </span>
          </button>
        ))}
      </div>

      {source === 'lien' && (
        <section className="card">
          <input type="url" inputMode="url" placeholder="https://www.marmiton.org/recettes/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn primary block" onClick={readUrl} disabled={!url.trim()}>
            Lire la recette
          </button>
          {blocked && (
            <div className="note warn small">
              <p>
                <strong>Ce site ne se laisse pas lire directement depuis une app web.</strong>
              </p>
              <p>
                Dans Safari : ouvrez la recette, touchez <strong>aA › Afficher le lecteur</strong>, sélectionnez tout, copiez, puis « Coller un texte » ici.
              </p>
              <p className="muted">
                Avec le service personnel (Réglages › Service IA, dossier worker), les liens sont lus directement{state.settings.aiServiceUrl ? '' : ' — il n’est pas encore configuré'}.
              </p>
            </div>
          )}
        </section>
      )}

      {source === 'photo' && (
        <section className="card">
          <p className="small muted">Page bien à plat, lumineuse, en entier. La lecture se fait sur le téléphone.</p>
          <div className="action-row">
            <button className="btn primary" onClick={() => cameraRef.current?.click()}>
              <Icon name="camera" size={18} /> Photographier
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} /> Galerie
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = [...(e.target.files ?? [])];
              if (f.length) readPhotos(f);
              e.target.value = '';
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const f = [...(e.target.files ?? [])];
              if (f.length) readPhotos(f);
              e.target.value = '';
            }}
          />
        </section>
      )}

      {source === 'texte' && (
        <section className="card">
          <textarea
            rows={10}
            value={text}
            placeholder={'Gratin de courgettes\nPour 4 personnes\nIngrédients\n800 g de courgettes\n3 œufs\nPréparation\n1. Couper les courgettes…'}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn primary block" disabled={!text.trim()} onClick={() => accept(parseRecipeText(text))}>
            Lire ce texte
          </button>
        </section>
      )}

      {status && <p className="note info">{status}</p>}
    </Sheet>
  );
}

const INGREDIENT_OPTIONS = (catalog: ReturnType<typeof useCatalog>) => Object.values(catalog.ingredients).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function ImportReview({ parsed, onBack, onClose, onSaved }: { parsed: ParsedRecipe; onBack: () => void; onClose: () => void; onSaved: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [name, setName] = useState(parsed.name);
  const [servings, setServings] = useState(parsed.servings ?? 4);
  const [lines, setLines] = useState<ImportLine[]>(() => proposeLines(parsed, catalog, state.aliases));
  const [steps, setSteps] = useState(parsed.steps.join('\n'));
  const update = (k: number, patch: Partial<ImportLine>) => setLines((ls) => ls.map((l, i) => (i === k ? { ...l, ...patch } : l)));
  const usable = lines.filter((l) => l.ingredientId && l.qty && l.unit).length;
  const options = INGREDIENT_OPTIONS(catalog);

  const save = () => {
    const recipe = toImportedRecipe(parsed, lines, servings, name.trim(), steps.split('\n').map((s) => s.trim()).filter(Boolean), catalog);
    // Les rattachements corrigés servent aux prochains imports et tickets.
    const learned: Record<string, string> = {};
    for (const l of lines) if (l.ingredientId && l.name) learned[l.name.toLowerCase()] = l.ingredientId;
    dispatch({ type: 'learnAliases', entries: learned });
    dispatch({ type: 'keepRecipe', recipe });
    haptic('medium');
    onSaved(recipe.id);
  };

  return (
    <Sheet title="Vérifier la recette" onClose={onClose} actions={<button className="btn-link" onClick={onBack}>Source</button>}>
      {parsed.imageUrl && <img className="recipe-photo" src={parsed.imageUrl} alt="" />}
      <label className="field">
        <span>Nom</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-inline">
        <span>La recette est pour</span>
        <Stepper value={servings} min={1} max={16} onChange={setServings} format={(v) => `${v} pers.`} />
      </div>
      <p className="muted small">
        {usable}/{lines.length} ingrédients rattachés. Les quantités sont celles de la recette entière : Popote les ramène à une portion. Une ligne « ignorée » ne compte pas dans les courses.
      </p>
      <ul className="receipt-list">
        {lines.map((l, k) => (
          <li key={k} className={l.ingredientId ? 'receipt-row' : 'receipt-row off'}>
            <p className="small">
              <span className="mono">{l.measure}</span>
              {!l.ingredientId && <span className="badge trop_long">à rattacher</span>}
            </p>
            <div className="receipt-edit">
              <select
                value={l.ingredientId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const units = unitsFor(id);
                  update(k, { ingredientId: id, unit: l.unit && units.includes(l.unit) ? l.unit : units[0] });
                }}
              >
                <option value="">— Ignorer —</option>
                {options.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              {l.ingredientId && (
                <div className="row gap">
                  <input
                    className="narrow"
                    inputMode="decimal"
                    value={l.qty === null ? '' : String(Math.round(l.qty * 100) / 100).replace('.', ',')}
                    placeholder="qté"
                    onChange={(e) => update(k, { qty: parseFloat(e.target.value.replace(',', '.')) || null })}
                  />
                  <select value={l.unit ?? ''} onChange={(e) => update(k, { unit: e.target.value as Unit })}>
                    {!l.unit && <option value="">unité</option>}
                    {[...new Set<Unit>([...unitsFor(l.ingredientId), 'cc', 'cs'])]
                      .filter((u) => toIngredientUnit(1, u, catalog.ingredients[l.ingredientId!]) !== null)
                      .map((u) => (
                        <option key={u} value={u}>
                          {u === 'cc' ? 'c. à c.' : u === 'cs' ? 'c. à s.' : u}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <label className="field">
        <span>Étapes (une par ligne)</span>
        <textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <button className="btn primary block" disabled={usable === 0 || !name.trim()} onClick={save}>
        Enregistrer dans mes recettes
      </button>
    </Sheet>
  );
}
