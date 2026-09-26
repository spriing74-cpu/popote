import { useCallback, useEffect, useRef } from 'react';

// Intégration iOS : retour haptique, appui long, écran allumé, détection du mode « app ».

export const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Lancée depuis l'écran d'accueil (et non dans Safari). */
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * Petit « tic » haptique. Safari (iOS 18+) déclenche le moteur haptique quand on bascule une case
 * `<input type="checkbox" switch>` : on en crée une invisible, le temps d'un clic. Android : vibration.
 * Doit être appelé pendant un geste de l'utilisateur ; sans effet ailleurs.
 */
let hapticsOn = true;
export function setHapticsEnabled(on: boolean): void {
  hapticsOn = on;
}

export function haptic(strength: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!hapticsOn) return;
  try {
    if (!isIOS && 'vibrate' in navigator) {
      navigator.vibrate(strength === 'heavy' ? 18 : strength === 'medium' ? 12 : 8);
      return;
    }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    if (strength === 'heavy') label.click();
    label.remove();
  } catch {
    /* pas de retour haptique disponible */
  }
}

/**
 * Appui long (450 ms) façon menu contextuel iOS. Annulé si le doigt bouge ;
 * le clic qui suit un appui long est ignoré.
 */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        haptic('medium');
        onLongPress();
      }, delay);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // Évite le menu « Copier / Rechercher » de Safari sur un appui long.
      e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}

/** Garde l'écran allumé (mode cuisine) tant que `active` est vrai et que la page est visible. */
export function useWakeLock(active: boolean): boolean {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!active || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
        if (stopped) lock?.release();
      } catch {
        /* refusé (batterie faible…) */
      }
    };
    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [active, supported]);
  return supported;
}

/** Pastille sur l'icône de l'app (iOS 16.4+ installée, après accord des notifications). */
export async function setBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    /* non autorisé */
  }
}

/** Anime un changement d'écran (View Transitions, Safari 18+), sinon change directement. */
export function withTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(update);
  else update();
}
