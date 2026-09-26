import { useRef, useState } from 'react';
import { EQUIPMENT_LABELS, parseRatingPlate, type Equipment, type EquipmentKind } from '../domain/equipment';
import { enhanceForOcr, loadImage } from '../scan/image';
import { recognizeText } from '../scan/ocr';
import { AiServiceError, fetchApplianceSettings, identifyAppliance } from '../scan/aiService';
import { useStore } from '../state/store';
import { Chip, Sheet, Toggle, uid } from './common';

/** « Ma cuisine » : liste des équipements. */
export function EquipmentCard() {
  const { state } = useStore();
  const [editing, setEditing] = useState<Equipment | null>(null);
  return (
    <section className="card">
      <p className="muted small">Déclarez vos appareils : chaque recette affiche ensuite les réglages adaptés (chaleur tournante, airfryer, micro-ondes, autocuiseur).</p>
      <ul className="plain">
        {state.equipment.map((e) => (
          <li key={e.id} className="row space-between">
            <button className="linkish" onClick={() => setEditing(e)}>
              <strong>{EQUIPMENT_LABELS[e.kind]}</strong> {[e.brand, e.model].filter(Boolean).join(' ')}
              {e.ai && <span className="badge info">réglages IA</span>}
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn primary block"
        onClick={() => setEditing({ id: uid(), kind: 'four', brand: '', model: '', convection: true, maxTempC: null, basketLiters: null, watts: null, notes: '' })}
      >
        + Ajouter un appareil
      </button>
      {editing && <EquipmentSheet initial={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Adresse du service IA personnel (Cloudflare Worker). */
export function AiServiceCard() {
  const { state, dispatch } = useStore();
  const [url, setUrl] = useState(state.settings.aiServiceUrl);
  return (
    <section className="card">
      <div className="field" style={{ marginTop: 0 }}>
        <span>Service IA personnel (facultatif)</span>
        <p className="muted small">
          Adresse de votre Cloudflare Worker (voir le guide « worker/README.md » du projet). Il garde votre clé Anthropic ; chaque reconnaissance ou recherche est facturée sur votre compte Anthropic.
        </p>
        <div className="row gap">
          <input type="url" inputMode="url" placeholder="https://popote-ia.votre-compte.workers.dev" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
          <button
            className="btn"
            disabled={!!url && !/^https:\/\//.test(url)}
            onClick={() => dispatch({ type: 'updateSettings', patch: { aiServiceUrl: url } })}
          >
            Enregistrer
          </button>
        </div>
        {state.settings.aiServiceUrl ? <p className="note ok small">✓ IA activée.</p> : <p className="muted small">IA désactivée : tout le reste fonctionne sans.</p>}
      </div>
    </section>
  );
}

function EquipmentSheet({ initial, onClose }: { initial: Equipment; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [eq, setEq] = useState<Equipment>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plateModels, setPlateModels] = useState<string[]>([]);
  const plateRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const aiUrl = state.settings.aiServiceUrl;
  const exists = state.equipment.some((e) => e.id === initial.id);
  const set = (patch: Partial<Equipment>) => setEq((e) => ({ ...e, ...patch }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')) || null);

  const readPlate = async (file: File) => {
    setBusy(true);
    setPlateModels([]);
    try {
      setStatus('Lecture de la plaque…');
      const text = await recognizeText(enhanceForOcr(await loadImage(file, 1800)), (p, s) => setStatus(`${s} ${Math.round(p * 100)} %`));
      const r = parseRatingPlate(text);
      if (r.brand) set({ brand: r.brand });
      if (r.models[0]) set({ model: r.models[0] });
      setPlateModels(r.models);
      setStatus(r.brand || r.models.length ? 'Plaque lue : vérifiez la marque et la référence.' : 'Rien de lisible. Photographiez la plaque de près, sans reflet (souvent dans l’encadrement de la porte ou sous l’appareil).');
    } catch {
      setStatus('Lecture impossible (le moteur se télécharge à la première utilisation).');
    } finally {
      setBusy(false);
    }
  };

  const identify = async (file: File) => {
    setBusy(true);
    try {
      setStatus('Envoi de la photo à votre service IA…');
      const r = await identifyAppliance(aiUrl, await loadImage(file, 1280));
      set({ kind: r.kind, brand: r.brand ?? eq.brand, model: r.model ?? eq.model });
      setStatus(`Reconnu (${r.confidence === 'haute' ? 'confiance élevée' : r.confidence === 'moyenne' ? 'confiance moyenne' : 'confiance faible'}) : ${[EQUIPMENT_LABELS[r.kind], r.brand, r.model].filter(Boolean).join(' · ')}. ${r.notes}`);
    } catch (e) {
      setStatus(e instanceof AiServiceError ? e.message : 'Échec de la reconnaissance.');
    } finally {
      setBusy(false);
    }
  };

  const searchSettings = async () => {
    setBusy(true);
    try {
      setStatus('Recherche de la notice et des réglages (jusqu’à 2 minutes)…');
      const ai = await fetchApplianceSettings(aiUrl, { kind: eq.kind, brand: eq.brand, model: eq.model });
      set({ ai, maxTempC: eq.maxTempC ?? ai.maxTempC ?? null });
      setStatus(`✓ ${ai.dishSettings.length} réglage(s) trouvé(s), ${ai.sources.length} source(s). Vérifiez-les dans votre notice.`);
    } catch (e) {
      setStatus(e instanceof AiServiceError ? e.message : 'Échec de la recherche.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    dispatch({ type: 'saveEquipment', equipment: eq });
    onClose();
  };

  return (
    <Sheet title={exists ? 'Appareil' : 'Nouvel appareil'} onClose={onClose}>
      <div className="field">
        <span>Type</span>
        <div className="chips">
          {(Object.keys(EQUIPMENT_LABELS) as EquipmentKind[]).map((k) => (
            <Chip key={k} active={eq.kind === k} onClick={() => set({ kind: k })}>
              {EQUIPMENT_LABELS[k]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="row gap wrap">
        <button className="btn" disabled={busy} onClick={() => plateRef.current?.click()}>
          📷 Lire la plaque signalétique
        </button>
        <button className="btn" disabled={busy || !aiUrl} onClick={() => photoRef.current?.click()} title={aiUrl ? '' : 'Configurez le service IA dans Réglages'}>
          🤖 Reconnaître sur photo (IA)
        </button>
      </div>
      <input ref={plateRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readPlate(f); e.target.value = ''; }} />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) identify(f); e.target.value = ''; }} />
      {status && <p className="note info small">{status}</p>}

      <label className="field">
        <span>Marque</span>
        <input type="text" value={eq.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="ex. Bosch, Ninja, Moulinex…" />
      </label>
      <label className="field">
        <span>Modèle / référence</span>
        <input type="text" value={eq.model} onChange={(e) => set({ model: e.target.value })} placeholder="ex. HBA5570S0" />
      </label>
      {plateModels.length > 1 && (
        <div className="chips">
          {plateModels.map((m) => (
            <Chip key={m} active={eq.model === m} onClick={() => set({ model: m })}>
              {m}
            </Chip>
          ))}
        </div>
      )}

      {eq.kind === 'four' && (
        <>
          <Toggle checked={eq.convection !== false} onChange={(v) => set({ convection: v })} label="Chaleur tournante disponible" />
          <label className="field-inline">
            <span>Température max (°C)</span>
            <input className="narrow" inputMode="numeric" value={eq.maxTempC ?? ''} placeholder="275" onChange={(e) => set({ maxTempC: num(e.target.value) })} />
          </label>
        </>
      )}
      {eq.kind === 'airfryer' && (
        <>
          <label className="field-inline">
            <span>Volume du panier (litres)</span>
            <input className="narrow" inputMode="decimal" value={eq.basketLiters ?? ''} placeholder="4,5" onChange={(e) => set({ basketLiters: num(e.target.value) })} />
          </label>
          <label className="field-inline">
            <span>Température max (°C)</span>
            <input className="narrow" inputMode="numeric" value={eq.maxTempC ?? ''} placeholder="200" onChange={(e) => set({ maxTempC: num(e.target.value) })} />
          </label>
        </>
      )}
      {eq.kind === 'microondes' && (
        <label className="field-inline">
          <span>Puissance (W)</span>
          <input className="narrow" inputMode="numeric" value={eq.watts ?? ''} placeholder="800" onChange={(e) => set({ watts: num(e.target.value) })} />
        </label>
      )}
      {eq.kind === 'plaques' && (
        <label className="field">
          <span>Type de plaques</span>
          <select value={eq.hob ?? 'induction'} onChange={(e) => set({ hob: e.target.value as Equipment['hob'] })}>
            <option value="induction">Induction</option>
            <option value="vitroceramique">Vitrocéramique</option>
            <option value="electrique">Électrique (fonte)</option>
            <option value="gaz">Gaz</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>Notes</span>
        <input type="text" value={eq.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="ex. chauffe fort à l’arrière" />
      </label>

      <div className="card">
        <h3>Réglages du fabricant (IA)</h3>
        {!aiUrl && <p className="muted small">Configurez votre service IA dans Réglages › Ma cuisine pour activer la recherche.</p>}
        <button className="btn primary block" disabled={busy || !aiUrl || !eq.brand.trim() || !eq.model.trim()} onClick={searchSettings}>
          🔎 Chercher la notice et les réglages de ce modèle
        </button>
        {eq.ai && <AiInfoView eq={eq} />}
      </div>

      <button className="btn primary block" onClick={save} disabled={busy}>
        Enregistrer l’appareil
      </button>
      {exists && (
        <button
          className="btn danger block"
          onClick={() => {
            dispatch({ type: 'removeEquipment', id: eq.id });
            onClose();
          }}
        >
          Supprimer
        </button>
      )}
    </Sheet>
  );
}

function AiInfoView({ eq }: { eq: Equipment }) {
  const ai = eq.ai!;
  return (
    <div className="small">
      <p className="note trop_long">
        Généré par IA à partir de sources web le {new Date(ai.fetchedAt).toLocaleDateString('fr-FR')} : peut contenir des erreurs. La notice de votre appareil fait foi.
      </p>
      {ai.summary && <p>{ai.summary}</p>}
      {ai.functions.length > 0 && <p><strong>Fonctions :</strong> {ai.functions.join(', ')}</p>}
      {(ai.maxTempC || ai.capacity) && (
        <p>
          {ai.maxTempC ? `Température max : ${ai.maxTempC} °C. ` : ''}
          {ai.capacity ? `Capacité : ${ai.capacity}.` : ''}
        </p>
      )}
      {ai.dishSettings.length > 0 && (
        <table className="qty-table">
          <thead>
            <tr>
              <th>Plat</th>
              <th>Mode</th>
              <th>°C</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            {ai.dishSettings.map((d, i) => (
              <tr key={i}>
                <td>
                  {d.dish}
                  {d.notes && <div className="muted">{d.notes}</div>}
                </td>
                <td>{d.mode}</td>
                <td>{d.tempC ?? '—'}</td>
                <td>{d.timeMin ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ai.tips.length > 0 && (
        <ul className="plain">
          {ai.tips.map((t, i) => (
            <li key={i}>• {t}</li>
          ))}
        </ul>
      )}
      {ai.caveats && <p className="muted">{ai.caveats}</p>}
      {ai.sources.length > 0 && (
        <p>
          <strong>Sources :</strong>{' '}
          {ai.sources.map((s, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title || new URL(s.url).hostname}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
