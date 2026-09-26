import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from './ios';

// Feuilles d'action et confirmations façon iOS, à la place de window.confirm()
// (qui affiche l'adresse du site en titre dans une app installée).

export interface SheetAction {
  id: string;
  label: string;
  destructive?: boolean;
}

interface Request {
  title?: string;
  message?: string;
  actions: SheetAction[];
  resolve: (id: string | null) => void;
}

interface DialogApi {
  /** Menu d'actions en bas de l'écran ; renvoie l'action choisie ou null (Annuler). */
  actions: (opts: { title?: string; message?: string; actions: SheetAction[] }) => Promise<string | null>;
  /** Confirmation d'une action ; `destructive` la colore en rouge. */
  confirm: (opts: { title: string; message?: string; confirmLabel: string; destructive?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  const [leaving, setLeaving] = useState(false);
  const queue = useRef<Request[]>([]);

  const open = useCallback((r: Omit<Request, 'resolve'>) => {
    return new Promise<string | null>((resolve) => {
      const full = { ...r, resolve };
      setReq((cur) => {
        if (cur) {
          queue.current.push(full);
          return cur;
        }
        return full;
      });
    });
  }, []);

  const api: DialogApi = {
    actions: (o) => open(o),
    confirm: async (o) => (await open({ title: o.title, message: o.message, actions: [{ id: 'ok', label: o.confirmLabel, destructive: o.destructive }] })) === 'ok',
  };

  const finish = (id: string | null) => {
    if (!req) return;
    if (id) haptic(req.actions.find((a) => a.id === id)?.destructive ? 'medium' : 'light');
    setLeaving(true);
    window.setTimeout(() => {
      req.resolve(id);
      setLeaving(false);
      setReq(queue.current.shift() ?? null);
    }, 200);
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Ctx.Provider value={api}>
      {children}
      {req && (
        <div className={leaving ? 'action-backdrop leaving' : 'action-backdrop'} onClick={() => finish(null)} role="presentation">
          <div className="action-sheet" role="dialog" aria-modal="true" aria-label={req.title ?? 'Actions'} onClick={(e) => e.stopPropagation()}>
            <div className="action-group">
              {(req.title || req.message) && (
                <div className="action-head">
                  {req.title && <p className="action-title">{req.title}</p>}
                  {req.message && <p className="action-message">{req.message}</p>}
                </div>
              )}
              {req.actions.map((a) => (
                <button key={a.id} className={a.destructive ? 'action-btn destructive' : 'action-btn'} onClick={() => finish(a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
            <button className="action-btn cancel" onClick={() => finish(null)} autoFocus>
              Annuler
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('DialogProvider manquant');
  return api;
}
