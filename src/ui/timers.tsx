import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from './ios';
import { Icon } from './icons';

// Minuteurs de cuisine : ils continuent quand on change d'écran (pastille flottante),
// sonnent et vibrent à la fin. L'écran reste allumé en mode cuisine ; iPhone verrouillé,
// une app web ne peut pas sonner.

export interface Timer {
  id: string;
  label: string;
  endsAt: number;
  total: number;
  done: boolean;
}

interface TimersApi {
  timers: Timer[];
  start: (label: string, minutes: number) => void;
  cancel: (id: string) => void;
  addMinute: (id: string) => void;
}

const Ctx = createContext<TimersApi | null>(null);

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    // Trois bips courts.
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35);
      o.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
  }, []);

  const running = timers.some((t) => !t.done);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const finished = timers.filter((t) => !t.done && t.endsAt <= now);
    if (finished.length === 0) return;
    setTimers((ts) => ts.map((t) => (finished.some((f) => f.id === t.id) ? { ...t, done: true } : t)));
    haptic('heavy');
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    beep();
    setOpen(true);
  }, [now, timers, beep]);

  const api: TimersApi = {
    timers,
    start: (label, minutes) => {
      // Le son doit être « débloqué » pendant un geste de l'utilisateur (Safari).
      try {
        audio.current ??= new AudioContext();
        audio.current.resume();
      } catch {
        /* pas de son */
      }
      haptic('medium');
      const t = Date.now();
      setNow(t);
      setTimers((ts) => [...ts, { id: `${t}-${Math.random().toString(36).slice(2, 6)}`, label, endsAt: t + minutes * 60000, total: minutes * 60000, done: false }]);
    },
    cancel: (id) => setTimers((ts) => ts.filter((t) => t.id !== id)),
    addMinute: (id) => setTimers((ts) => ts.map((t) => (t.id === id ? { ...t, endsAt: Math.max(t.endsAt, Date.now()) + 60000, total: t.total + 60000, done: false } : t))),
  };

  const next = [...timers].sort((a, b) => Number(b.done) - Number(a.done) || a.endsAt - b.endsAt)[0];

  return (
    <Ctx.Provider value={api}>
      {children}
      {next && (
        <div className={`timer-dock ${next.done ? 'done' : ''}`}>
          {open ? (
            <div className="timer-panel">
              {timers.map((t) => (
                <div key={t.id} className={t.done ? 'timer-line done' : 'timer-line'}>
                  <span className="timer-name">{t.label}</span>
                  <span className="timer-time">{t.done ? 'Terminé !' : formatRemaining(t.endsAt - now)}</span>
                  <button className="btn small" onClick={() => api.addMinute(t.id)}>
                    +1 min
                  </button>
                  <button className="icon-btn" onClick={() => api.cancel(t.id)} aria-label={t.done ? 'Fermer' : 'Arrêter'}>
                    <Icon name={t.done ? 'check' : 'close'} size={18} />
                  </button>
                </div>
              ))}
              <button className="btn-link" onClick={() => setOpen(false)}>
                Réduire
              </button>
            </div>
          ) : (
            <button className="timer-pill" onClick={() => setOpen(true)}>
              <Icon name="clock" size={18} />
              <span>{next.done ? `${next.label} : terminé` : formatRemaining(next.endsAt - now)}</span>
              {timers.length > 1 && <span className="timer-count">+{timers.length - 1}</span>}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useTimers(): TimersApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('TimersProvider manquant');
  return api;
}
