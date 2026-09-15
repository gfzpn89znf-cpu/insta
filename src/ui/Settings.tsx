import { useEffect, useRef, useState } from 'react';
import { updateProfile } from '../sim/actions';
import { storageEstimate } from '../sim/db';
import { importPhoto, pruneOrphanPhotos } from '../sim/photos';
import { dispatch, resetWorld, saveNow, setSpeed } from '../sim/store';
import type { World } from '../sim/types';
import { SPEEDS } from '../App';
import { AccountAvatar } from './Media';
import ScreenHeader from './Screen';
import { clockOf, followersOf, formatShort } from './common';
import { installPrompt } from './install';

/** Einstellungen und Profilbearbeitung - beides auf eigenen Bildschirmen. */
export default function Settings({
  world,
  onBack,
  onToast,
  profileOnly,
}: {
  world: World;
  onBack: () => void;
  onToast: (msg: string) => void;
  profileOnly?: boolean;
}) {
  const user = world.accounts[world.user.accountId];
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);
  const [confirming, setConfirming] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { day, label } = clockOf(world);

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, []);

  const saveProfile = () => {
    dispatch((w) => updateProfile(w, { name, handle, bio }));
    onToast('Profil gespeichert.');
    onBack();
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const id = await importPhoto(file);
    setBusy(false);
    if (!id) {
      onToast('Das Foto konnte nicht gelesen werden.');
      return;
    }
    dispatch((w) => {
      const me = w.accounts[w.user.accountId];
      me.photoId = id;
    });
    saveNow();
    onToast('Profilbild aktualisiert.');
  };

  return (
    <div className="screen">
      <ScreenHeader title={profileOnly ? 'Profil bearbeiten' : 'Einstellungen'} onBack={onBack} />
      <div className="screen-body">
        <div className="profile-edit">
          <AccountAvatar account={user} size={92} />
          <div>
            <button className="btn secondary sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Wird geladen...' : 'Profilbild waehlen'}
            </button>
            {user.photoId && (
              <button
                className="btn ghost sm"
                onClick={() => {
                  dispatch((w) => {
                    const me = w.accounts[w.user.accountId];
                    me.photoId = undefined;
                  });
                  saveNow();
                }}
              >
                Entfernen
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <span className="label">Name</span>
        <input className="input" id="set-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <span className="label">Benutzername</span>
        <input className="input" id="set-handle" value={handle} maxLength={24} onChange={(e) => setHandle(e.target.value)} />
        <span className="label">Biografie</span>
        <textarea className="textarea" id="set-bio" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} />
        <div className="hint">
          Eine klare Biografie erhoeht die Wahrscheinlichkeit, dass Profilbesucher dir auch folgen.
        </div>
        <button className="btn full" style={{ marginTop: 12 }} onClick={saveProfile}>
          Profil speichern
        </button>

        {!profileOnly && (
          <>
            <div className="section-title">Simulation</div>
            <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat">
                <div className="k">Zeit</div>
                <div className="v" style={{ fontSize: 18 }}>Tag {day}</div>
                <div className="d faint">{label} Uhr</div>
              </div>
              <div className="stat">
                <div className="k">Dein Stand</div>
                <div className="v" style={{ fontSize: 18 }}>{formatShort(followersOf(user))}</div>
                <div className="d faint">Follower</div>
              </div>
            </div>

            <span className="label">Geschwindigkeit</span>
            <div className="speeds">
              {SPEEDS.map((s) => (
                <button
                  key={s.value}
                  className={`speed-btn${(world.settings.paused ? 0 : world.settings.speed) === s.value ? ' active' : ''}`}
                  title={s.title}
                  onClick={() => setSpeed(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="hint">
              Die Welt laeuft auch weiter, wenn du die App schliesst - beim naechsten Oeffnen wird die vergangene Zeit
              nachgeholt (maximal drei simulierte Tage).
            </div>

            <div className="section-title">Fotos</div>
            <label className="switch-row" htmlFor="set-stock">
              <span>
                <b>Echte Fotos der KI-Accounts</b>
                <div className="hint" style={{ margin: 0 }}>
                  Laedt Fotos aus dem Netz. Ohne Verbindung zeichnet die App die Bilder selbst.
                </div>
              </span>
              <input
                id="set-stock"
                type="checkbox"
                checked={world.settings.stockPhotos}
                onChange={(e) => {
                  const on = e.target.checked;
                  dispatch((w) => {
                    w.settings.stockPhotos = on;
                  });
                  saveNow();
                }}
              />
            </label>

            {storage && storage.quota > 0 && (
              <div className="hint">
                Belegt: {formatShort(storage.usage / 1024 / 1024)} MB von {formatShort(storage.quota / 1024 / 1024)} MB
                verfuegbarem Speicher.
              </div>
            )}
            <button
              className="btn secondary full"
              style={{ marginTop: 8 }}
              onClick={() => {
                void pruneOrphanPhotos(world).then((n) => onToast(n > 0 ? `${n} ungenutzte Fotos geloescht.` : 'Keine ungenutzten Fotos gefunden.'));
              }}
            >
              Speicher aufraeumen
            </button>

            <div className="section-title">App</div>
            <InstallButton onToast={onToast} />
            <button
              className="btn secondary full"
              style={{ marginTop: 8 }}
              onClick={() => {
                saveNow();
                onToast('Spielstand gespeichert.');
              }}
            >
              Jetzt speichern
            </button>

            {confirming ? (
              <div className="card" style={{ padding: 12, marginTop: 10 }}>
                <p className="small">
                  Damit werden dein Account, alle Beitraege und die gesamte Welt geloescht. Das laesst sich nicht
                  rueckgaengig machen.
                </p>
                <div className="row">
                  <button className="btn secondary sm" onClick={() => setConfirming(false)}>Abbrechen</button>
                  <button className="btn sm danger" onClick={() => void resetWorld()}>
                    Endgueltig loeschen
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => setConfirming(true)}>
                Neu anfangen
              </button>
            )}

            <div className="hint" style={{ marginTop: 16 }}>
              Fotogram ist eine Simulation. Alle Accounts, Kommentare und Nachrichten werden auf deinem Geraet erzeugt -
              es gibt keinen Server und keine echten Personen.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Bietet die Installation an, wenn der Browser sie zulaesst. */
function InstallButton({ onToast }: { onToast: (msg: string) => void }) {
  const [available, setAvailable] = useState(installPrompt.available);
  useEffect(() => installPrompt.subscribe(setAvailable), []);

  if (installPrompt.installed) {
    return <div className="hint">Fotogram laeuft bereits als installierte App. 👍</div>;
  }

  return (
    <>
      <button
        className="btn grad full"
        onClick={() => {
          void installPrompt.show().then((ok) => {
            if (!ok) {
              onToast('Tippe im Browser-Menue auf „Zum Startbildschirm hinzufuegen".');
            }
          });
        }}
      >
        {available ? 'Fotogram installieren' : 'Zum Startbildschirm hinzufuegen'}
      </button>
      <div className="hint">
        iPhone: Teilen-Symbol antippen, dann „Zum Home-Bildschirm". Android: Menue (drei Punkte), dann „App installieren".
      </div>
    </>
  );
}
