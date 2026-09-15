/**
 * Installation auf dem Startbildschirm.
 *
 * Android-Browser bieten dafuer ein eigenes Ereignis an, das wir abfangen und
 * spaeter selbst ausloesen. iOS kennt das nicht - dort fuehrt nur der Weg
 * ueber das Teilen-Menue, worauf die Oberflaeche hinweist.
 */

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | undefined;
const listeners = new Set<(available: boolean) => void>();

function emit() {
  for (const fn of listeners) fn(deferred !== undefined);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export const installPrompt = {
  get available() {
    return deferred !== undefined;
  },
  get installed() {
    return isStandalone();
  },
  subscribe(fn: (available: boolean) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Zeigt den Installationsdialog. Gibt false zurueck, wenn es keinen gibt. */
  async show(): Promise<boolean> {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = undefined;
      emit();
      return choice.outcome === 'accepted';
    } catch {
      return false;
    }
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    emit();
  });
}
