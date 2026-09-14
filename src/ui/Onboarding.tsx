import { useState } from 'react';
import { NICHES, NICHE_IDS } from '../sim/niches';
import { normalizeHandle } from '../sim/names';
import { startNewWorld } from '../sim/store';
import type { NicheId } from '../sim/types';

export default function Onboarding({ canResume, onResume }: { canResume: boolean; onResume: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [niche, setNiche] = useState<NicheId>('fitness');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const cleanHandle = normalizeHandle(handle || name).slice(0, 24);

  const start = () => {
    setBusy(true);
    // Der Weltaufbau rechnet die Vorgeschichte der Szene in Haeppchen,
    // damit die Anzeige mitlaeuft statt zu blockieren.
    void startNewWorld(
      {
        name: name.trim() || 'Neuer Account',
        handle: cleanHandle || 'neuer.account',
        bio: bio.trim() || NICHES[niche].bios[0],
        niche,
      },
      undefined,
      setProgress,
    );
  };

  return (
    <div className="onboard">
      <div className="card onboard-card" style={{ padding: 26 }}>
        <div className="brand" style={{ padding: 0, fontSize: 34 }}>Fotogram</div>
        <p className="muted" style={{ marginTop: 4 }}>
          Ein Foto-Netzwerk mit hunderten eigenstaendigen KI-Accounts. Sie posten, folgen, kommentieren und werden
          beruehmt - oder eben nicht. Deine Aufgabe: dich zwischen ihnen durchsetzen.
        </p>

        {canResume && step === 0 && (
          <button className="btn full" style={{ marginBottom: 16 }} onClick={onResume}>
            Gespeicherten Stand fortsetzen
          </button>
        )}

        {step === 0 && (
          <>
            <span className="label">Wie heisst du?</span>
            <input
              className="input"
              value={name}
              placeholder="z. B. Lena Bergmann"
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="label">Benutzername</span>
            <input
              className="input"
              value={handle}
              placeholder={cleanHandle || 'lena.bergmann'}
              maxLength={24}
              onChange={(e) => setHandle(e.target.value)}
            />
            <div className="hint">@{cleanHandle || 'dein.name'}</div>
            <button className="btn grad full" style={{ marginTop: 18 }} disabled={!name.trim()} onClick={() => setStep(1)}>
              Weiter
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <span className="label">Welches Thema wird dein Schwerpunkt?</span>
            <div className="niche-grid">
              {NICHE_IDS.map((n) => (
                <button key={n} className={`niche-btn${n === niche ? ' on' : ''}`} onClick={() => setNiche(n)}>
                  <span className="e">{NICHES[n].emoji}</span>
                  {NICHES[n].label}
                </button>
              ))}
            </div>
            <div className="hint">
              {NICHES[niche].label}: Zielgruppe {Math.round(NICHES[niche].reach * 100)} von 100, Wettbewerb{' '}
              {Math.round(NICHES[niche].competition * 100)} von 100. Grosse Nischen bieten mehr Reichweite, aber auch mehr
              Konkurrenz.
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setStep(0)}>Zurueck</button>
              <button className="btn grad" style={{ flex: 1 }} onClick={() => setStep(2)}>Weiter</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <span className="label">Deine Biografie</span>
            <textarea
              className="textarea"
              value={bio}
              maxLength={160}
              placeholder={NICHES[niche].bios[0]}
              onChange={(e) => setBio(e.target.value)}
            />
            <div className="hint">
              Sag in einem Satz, was Besucher bei dir bekommen. Das entscheidet mit darueber, ob aus Reichweite Follower
              werden.
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn secondary" onClick={() => setStep(1)} disabled={busy}>Zurueck</button>
              <button className="btn grad" style={{ flex: 1 }} onClick={start} disabled={busy}>
                {busy ? `Welt wird aufgebaut... ${Math.round(progress * 100)} %` : 'Account erstellen'}
              </button>
            </div>
            {busy && (
              <div style={{ marginTop: 14 }}>
                <div className="meter">
                  <span style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }} />
                </div>
                <div className="hint center-text">
                  220 KI-Accounts erleben gerade ihre letzten zehn Tage: Beitraege, Follower, erste Trends.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
