import { useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '../domain/types';
import { lookupBarcode } from '../domain/openfoodfacts';
import { defaultLocation, defaultQuantity, estimateExpiry, todayIso } from '../domain/inventory';
import { canUseLiveCamera, detectBarcode } from '../scan/barcode';
import { loadImage } from '../scan/image';
import { useCatalog, useStore } from '../state/store';
import { Sheet } from './common';
import { ItemForm } from './ItemForm';

type Phase = { k: 'scan' } | { k: 'lookup'; code: string } | { k: 'form'; code: string; prefill: Partial<InventoryItem>; note: string | null };

/** Scan de codes-barres en série : scanner, vérifier, enregistrer, produit suivant. */
export function BarcodeScanner({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const live = canUseLiveCamera();
  const today = todayIso();

  const handleCode = useCallback(
    async (code: string) => {
      setError(null);
      setPhase({ k: 'lookup', code });
      if (navigator.vibrate) navigator.vibrate(60);
      const known = state.products[code];
      let product = known ?? null;
      let note: string | null = null;
      if (!product) {
        const r = await lookupBarcode(code, catalog, state.aliases);
        if (r.status === 'trouve') {
          product = r.product;
          dispatch({ type: 'saveProduct', product });
        } else if (r.status === 'inconnu') note = 'Produit absent d’Open Food Facts : complétez la fiche (elle sera mémorisée).';
        else if (r.status === 'hors_ligne') note = 'Hors ligne : produit non identifié, complétez la fiche.';
        else note = r.message;
      }
      const ingredientId = product?.ingredientId ?? null;
      const q = defaultQuantity(catalog, ingredientId, 1, product?.qty ?? null, product?.unit ?? null);
      const loc = defaultLocation(ingredientId);
      setPhase({
        k: 'form',
        code,
        note,
        prefill: {
          label: product ? product.name : '',
          brand: product?.brand || undefined,
          barcode: code,
          ingredientId,
          qty: q.qty,
          unit: q.unit,
          location: loc,
          expiry: estimateExpiry(ingredientId, loc, today),
          expirySource: 'estimee',
        },
      });
    },
    [catalog, dispatch, state.aliases, state.products, today],
  );

  // Caméra en direct (HTTPS uniquement).
  useEffect(() => {
    if (!live || phase.k !== 'scan') return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const code = await detectBarcode(v);
              if (code && !stopped) {
                stopped = true;
                handleCode(code);
                return;
              }
            }
          } catch {
            /* image suivante */
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError('Caméra indisponible : autorisez l’accès à la caméra, ou utilisez la photo.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [live, phase.k, handleCode]);

  const fromPhoto = async (file: File) => {
    setError(null);
    try {
      const canvas = await loadImage(file, 2000);
      const code = await detectBarcode(canvas);
      if (code) handleCode(code);
      else setError('Aucun code-barres lu. Cadrez le code de près, bien net et éclairé.');
    } catch {
      setError('Lecture impossible (le lecteur se télécharge à la première utilisation : connexion nécessaire).');
    }
  };

  return (
    <Sheet title="Scanner des produits" onClose={onClose}>
      {added.length > 0 && <p className="note ok">✓ Ajouté{added.length > 1 ? 's' : ''} : {added.join(', ')}</p>}

      {phase.k === 'scan' && (
        <>
          {live ? (
            <div className="camera">
              <video ref={videoRef} playsInline muted />
              <div className="camera-frame" aria-hidden />
              <p className="camera-hint">Visez le code-barres</p>
            </div>
          ) : (
            <p className="note info">Caméra en direct disponible uniquement sur la version en ligne (HTTPS). Prenez le code-barres en photo :</p>
          )}
          <button className="btn primary block" onClick={() => fileRef.current?.click()}>
            📷 Prendre le code-barres en photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) fromPhoto(f);
              e.target.value = '';
            }}
          />
          <div className="field">
            <span>Ou saisir les chiffres du code</span>
            <div className="row gap">
              <input inputMode="numeric" pattern="[0-9]*" value={manual} placeholder="ex. 3017620422003" onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} />
              <button className="btn" disabled={manual.length < 8} onClick={() => handleCode(manual)}>
                OK
              </button>
            </div>
          </div>
          {error && <p className="note trop_long">{error}</p>}
          <p className="muted small">Le code est recherché sur Open Food Facts (base libre, seul le code est envoyé). Un produit déjà scanné est reconnu hors ligne.</p>
        </>
      )}

      {phase.k === 'lookup' && <p className="empty">Recherche du produit {phase.code}…</p>}

      {phase.k === 'form' && (
        <>
          {phase.note && <p className="note info">{phase.note}</p>}
          <ItemForm
            key={phase.code + added.length}
            initial={phase.prefill}
            saveLabel="Ajouter et scanner le suivant"
            onSave={(item) => {
              dispatch({ type: 'addInventory', items: [item] });
              // Mémorise le produit avec l'ingrédient choisi pour les prochains scans.
              dispatch({
                type: 'saveProduct',
                product: {
                  barcode: phase.code,
                  name: item.label,
                  brand: item.brand ?? '',
                  ingredientId: item.ingredientId,
                  qty: item.qty,
                  unit: item.unit,
                  source: state.products[phase.code]?.source ?? 'manuel',
                },
              });
              setAdded((a) => [...a, item.label]);
              setManual('');
              setPhase({ k: 'scan' });
            }}
          />
          <button className="btn block" onClick={() => setPhase({ k: 'scan' })}>
            Annuler ce produit
          </button>
        </>
      )}
    </Sheet>
  );
}
