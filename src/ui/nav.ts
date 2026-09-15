import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Navigation als Stapel von Ansichten, gekoppelt an die Browser-Historie.
 *
 * Dadurch funktioniert die Zurueck-Geste des Handys (und der Zurueck-Knopf
 * des Browsers) genauso wie die Zurueck-Pfeile in der App selbst.
 */
export type View =
  | { kind: 'feed' }
  | { kind: 'explore' }
  | { kind: 'notifications' }
  | { kind: 'messages' }
  | { kind: 'insights' }
  | { kind: 'profile'; id: string }
  | { kind: 'people'; id: string; mode: 'followers' | 'following' }
  | { kind: 'hashtag'; tag: string }
  | { kind: 'post'; id: string }
  | { kind: 'chat'; accountId: string }
  | { kind: 'call'; accountId: string; video: boolean; incoming?: boolean }
  | { kind: 'composer' }
  | { kind: 'stories'; ids: string[]; index: number }
  | { kind: 'settings' }
  | { kind: 'editProfile' };

export type TabKind = 'feed' | 'explore' | 'notifications' | 'messages' | 'insights';

const TABS: TabKind[] = ['feed', 'explore', 'notifications', 'messages', 'insights'];

/** Ansichten, die ueber dem bisherigen Bildschirm liegen statt ihn zu ersetzen. */
const OVERLAYS = new Set(['post', 'composer', 'stories', 'call']);

export function isOverlay(view: View): boolean {
  return OVERLAYS.has(view.kind);
}

export function isTab(view: View): view is View & { kind: TabKind } {
  return TABS.includes(view.kind as TabKind);
}

const MAX_STACK = 40;

export interface Navigation {
  stack: View[];
  /** Oberste Ansicht. */
  top: View;
  /** Ansicht darunter - wird hinter einer Ueberlagerung gezeichnet. */
  below: View | undefined;
  /** Aktiver Reiter fuer die Leiste unten. */
  tab: TabKind;
  canGoBack: boolean;
  go(view: View): void;
  /** Reiter wechseln - setzt den Stapel auf diesen Reiter zurueck. */
  goTab(tab: TabKind): void;
  back(): void;
  /** Zurueck bis zur obersten Reiter-Ansicht. */
  backToTab(): void;
}

export function useNavigation(): Navigation {
  const [stack, setStack] = useState<View[]>([{ kind: 'feed' }]);
  // Die Historie kennt nur die Tiefe; der Inhalt bleibt hier im Zustand.
  const depth = useRef(1);

  useEffect(() => {
    // Ein erster Eintrag, damit das erste Zurueck in der App landet und
    // nicht sofort die Seite verlaesst.
    try {
      history.replaceState({ fotogramDepth: 1 }, '');
    } catch {
      /* ignorieren */
    }
    const onPop = (event: PopStateEvent) => {
      const target = (event.state?.fotogramDepth as number | undefined) ?? 1;
      setStack((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.slice(0, Math.max(1, Math.min(prev.length - 1, target)));
        depth.current = next.length;
        return next;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((view: View, replaceRoot: boolean) => {
    setStack((prev) => {
      const next = replaceRoot ? [view] : [...prev, view];
      const trimmed = next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
      depth.current = trimmed.length;
      try {
        history.pushState({ fotogramDepth: trimmed.length }, '');
      } catch {
        /* ignorieren */
      }
      return trimmed;
    });
  }, []);

  const go = useCallback((view: View) => push(view, false), [push]);

  const goTab = useCallback(
    (tab: TabKind) => {
      setStack((prev) => {
        const top = prev[prev.length - 1];
        // Nochmal auf denselben Reiter tippen fuehrt zurueck an dessen Anfang.
        if (top.kind === tab) return prev;
        const next = [...prev, { kind: tab } as View];
        const trimmed = next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
        depth.current = trimmed.length;
        try {
          history.pushState({ fotogramDepth: trimmed.length }, '');
        } catch {
          /* ignorieren */
        }
        return trimmed;
      });
    },
    [],
  );

  const back = useCallback(() => {
    // Ueber die Historie zuruecklaufen, damit Handy-Geste und App-Knopf
    // denselben Weg nehmen.
    try {
      history.back();
    } catch {
      setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }
  }, []);

  const backToTab = useCallback(() => {
    setStack((prev) => {
      let cut = prev.length - 1;
      while (cut > 0 && !isTab(prev[cut])) cut--;
      const steps = prev.length - 1 - cut;
      if (steps > 0) {
        try {
          history.go(-steps);
          return prev;
        } catch {
          /* ignorieren */
        }
      }
      return prev;
    });
  }, []);

  const top = stack[stack.length - 1];
  const below = stack.length > 1 ? stack[stack.length - 2] : undefined;
  let tab: TabKind = 'feed';
  for (const view of stack) if (isTab(view)) tab = view.kind;

  return { stack, top, below, tab, canGoBack: stack.length > 1, go, goTab, back, backToTab };
}
