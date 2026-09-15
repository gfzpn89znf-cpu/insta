import { useEffect, useRef, useState } from 'react';
import { MIN_PIN, setPin, unlockWithPin } from '../sim/privacy';

/**
 * Der Sperrbildschirm.
 *
 * Solange er zu ist, wurde noch nichts entschluesselt - im Speicher des
 * Geraets stehen nur unlesbare Bytes. Nach mehreren Fehlversuchen dauert der
 * naechste Versuch laenger, damit Durchprobieren nichts bringt.
 */
export default function Lock({
  mode,
  onDone,
  onCancel,
}: {
  mode: 'unlock' | 'create';
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [pin, setPinValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Laeuft die Wartezeit, die Anzeige sekundenweise mitzaehlen lassen.
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const waiting = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));

  const submit = async () => {
    if (busy || waiting > 0) return;
    setError(null);

    if (mode === 'create') {
      if (pin.length < MIN_PIN) {
        setError(`Die PIN braucht mindestens ${MIN_PIN} Zeichen.`);
        return;
      }
      if (pin !== repeat) {
        setError('Die beiden Eingaben sind nicht gleich.');
        return;
      }
      setBusy(true);
      const outcome = await setPin(pin);
      setBusy(false);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      onDone();
      return;
    }

    setBusy(true);
    const ok = await unlockWithPin(pin);
    setBusy(false);
    if (ok) {
      onDone();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setPinValue('');
    // Ab dem dritten Fehlversuch wird gewartet - und die Wartezeit waechst.
    if (next >= 3) setWaitUntil(Date.now() + Math.min(60, 2 ** (next - 2)) * 1000);
    setError('Falsche PIN.');
  };

  return (
    <div className="lock">
      <div className="lock-card">
        <div className="lock-icon" aria-hidden="true">🔒</div>
        <div className="brand" style={{ padding: 0, fontSize: 30 }}>Fotogram</div>
        <p className="small muted" style={{ marginTop: 0 }}>
          {mode === 'create'
            ? 'Waehle eine PIN. Damit werden dein Spielstand, deine Fotos und deine Videos auf dem Geraet verschluesselt.'
            : 'Deine Daten sind verschluesselt. Gib deine PIN ein, um sie zu oeffnen.'}
        </p>

        <input
          ref={inputRef}
          className="input lock-input"
          type="password"
          inputMode="numeric"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          placeholder="PIN"
          value={pin}
          maxLength={32}
          onChange={(e) => setPinValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && mode === 'unlock') void submit();
          }}
        />

        {mode === 'create' && (
          <input
            className="input lock-input"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="PIN wiederholen"
            value={repeat}
            maxLength={32}
            onChange={(e) => setRepeat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        )}

        {error && (
          <div className="tip warn" style={{ marginTop: 10 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {mode === 'create' && (
          <div className="hint">
            Merke sie dir gut: Fotogram kennt die PIN nicht und kann sie nicht zuruecksetzen. Ohne PIN sind die Daten
            endgueltig verloren.
          </div>
        )}

        <button
          className="btn grad full"
          style={{ marginTop: 12 }}
          disabled={busy || waiting > 0 || pin.length < MIN_PIN}
          onClick={() => void submit()}
        >
          {busy ? 'Einen Moment...' : waiting > 0 ? `Noch ${waiting} s` : mode === 'create' ? 'PIN setzen' : 'Entsperren'}
        </button>

        {onCancel && (
          <button className="btn ghost full" style={{ marginTop: 6 }} onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
