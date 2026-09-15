import { useEffect, useRef, useState } from 'react';
import { updateProfile } from '../sim/actions';
import { AI_MODELS, getAiSettings, getUsage, onAiChange, setAiSettings, testAiKey } from '../sim/ai';
import { storageEstimate } from '../sim/db';
import { queryFor, searchImages, searchVideos, type MediaHit } from '../sim/media';
import { portraitUrl } from '../sim/photos';
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
            <MediaCheck />

            <button
              className="btn secondary full"
              style={{ marginTop: 8 }}
              onClick={() => {
                void pruneOrphanPhotos(world).then((n) => onToast(n > 0 ? `${n} ungenutzte Fotos geloescht.` : 'Keine ungenutzten Fotos gefunden.'));
              }}
            >
              Speicher aufraeumen
            </button>

            <div className="section-title">Kuenstliche Intelligenz</div>
            <AiSection onToast={onToast} />

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

/**
 * Prueft direkt auf dem Geraet, ob die Bildquellen erreichbar sind und was
 * sie zu einem Motiv liefern. Ohne diese Ansicht bliebe nur Raten, wenn ein
 * Bild nicht passt.
 */
function MediaCheck() {
  const [running, setRunning] = useState(false);
  const [images, setImages] = useState<MediaHit[] | null>(null);
  const [videos, setVideos] = useState<MediaHit[] | null>(null);
  const [portraitOk, setPortraitOk] = useState<boolean | null>(null);
  const [topic, setTopic] = useState('fitness:mealprep');

  const check = async () => {
    setRunning(true);
    setImages(null);
    setVideos(null);
    setPortraitOk(null);
    const [niche, topicId] = topic.split(':');
    const query = queryFor(niche as never, topicId);

    const [foundImages, foundVideos] = await Promise.all([searchImages(query, 320), searchVideos(query)]);
    setImages(foundImages);
    setVideos(foundVideos);

    // Portraitdienst getrennt pruefen - er kommt aus einer anderen Quelle.
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        setPortraitOk(true);
        resolve();
      };
      img.onerror = () => {
        setPortraitOk(false);
        resolve();
      };
      img.src = portraitUrl('pruefung', true, 128);
    });

    setRunning(false);
  };

  return (
    <div className="card" style={{ padding: 14, marginTop: 10 }}>
      <div className="small bold">Bildquellen pruefen</div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Zeigt, was zu einem Motiv tatsaechlich gefunden wird. Passt etwas nicht, siehst du es hier sofort.
      </p>
      <select className="select" id="media-check-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
        <option value="fitness:mealprep">Fitness · Meal Prep</option>
        <option value="fitness:workout">Fitness · Workout-Routine</option>
        <option value="food:rezept">Food · Rezept</option>
        <option value="pets:welpe">Tiere · Welpen-Update</option>
        <option value="travel:sonnenaufgang">Reisen · Sonnenaufgang</option>
        <option value="dance:choreo">Tanz · Choreografie</option>
        <option value="cars:youngtimer">Autos · Youngtimer</option>
      </select>
      <button className="btn secondary full" style={{ marginTop: 8 }} disabled={running} onClick={() => void check()}>
        {running ? 'Wird geprueft...' : 'Jetzt pruefen'}
      </button>

      {images !== null && (
        <div style={{ marginTop: 12 }}>
          <div className="small">
            {images.length > 0 ? `✅ ${images.length} Fotos gefunden` : '⚠️ Keine Fotos gefunden - es wird gezeichnet'}
          </div>
          <div className="check-grid">
            {images.slice(0, 6).map((hit) => (
              <figure key={hit.url}>
                <img src={hit.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <figcaption>{hit.title}</figcaption>
              </figure>
            ))}
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            {videos && videos.length > 0
              ? `✅ ${videos.length} Videos gefunden: ${videos[0].title}`
              : '⚠️ Keine abspielbaren Videos - Reels zeigen dann bewegte Fotos'}
          </div>
          <div className="small">
            {portraitOk === null ? '' : portraitOk ? '✅ Profilfotos erreichbar' : '⚠️ Profilfotos nicht erreichbar'}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Schaltet die echte KI frei. Der Schluessel bleibt auf dem Geraet und geht
 * nur an Anthropic - Fotogram hat keinen Server, der ihn sehen koennte.
 */
function AiSection({ onToast }: { onToast: (msg: string) => void }) {
  const [settings, setSettings] = useState(getAiSettings);
  const [usage, setUsage] = useState(getUsage);
  const [key, setKey] = useState(settings.apiKey);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() =>
    onAiChange(() => {
      setSettings(getAiSettings());
      setUsage(getUsage());
    }),
  []);

  const save = (patch: Parameters<typeof setAiSettings>[0]) => {
    setAiSettings(patch);
    setSettings(getAiSettings());
  };

  const check = async () => {
    setTesting(true);
    setResult(null);
    const outcome = await testAiKey(key, settings.model);
    setTesting(false);
    setResult(outcome);
    if (outcome.ok) {
      save({ apiKey: key });
      onToast('Echte KI ist aktiv.');
    }
  };

  const active = settings.apiKey.length > 20;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <b>{active ? '✅ Echte KI aktiv' : 'Noch nicht eingerichtet'}</b>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Ohne Schluessel schreiben die Accounts aus vorbereiteten Bausteinen. Mit einem eigenen Schluessel von Anthropic
        denken sich Claude-Modelle jede Nachricht, jeden Kommentar und jede Bildunterschrift selbst aus - und gehen am
        Telefon auf das ein, was du sagst.
      </p>
      <p className="small faint">
        Schluessel bekommst du unter console.anthropic.com. Er wird nur auf diesem Geraet gespeichert und ausschliesslich
        an Anthropic geschickt. Es entstehen Kosten nach Verbrauch - meist Bruchteile eines Cents pro Nachricht.
      </p>

      <span className="label">API-Schluessel</span>
      <input
        className="input"
        id="ai-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        placeholder="sk-ant-..."
        onChange={(e) => setKey(e.target.value)}
      />

      <span className="label">Modell</span>
      <select className="select" id="ai-model" value={settings.model} onChange={(e) => save({ model: e.target.value })}>
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} - {m.hint}
          </option>
        ))}
      </select>

      <span className="label">Hoechstens Anfragen pro Tag</span>
      <input
        className="input"
        id="ai-budget"
        type="number"
        min={10}
        max={5000}
        value={settings.dailyBudget}
        onChange={(e) => save({ dailyBudget: Math.max(10, Number(e.target.value) || 10) })}
      />
      <div className="hint">Schutz vor unerwarteten Kosten. Ist das Budget aufgebraucht, uebernehmen die Bausteine.</div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={testing || key.trim().length < 20} onClick={() => void check()}>
          {testing ? 'Wird geprueft...' : 'Verbinden und testen'}
        </button>
        {active && (
          <button
            className="btn secondary sm"
            onClick={() => {
              save({ apiKey: '' });
              setKey('');
              setResult(null);
              onToast('KI-Schluessel entfernt.');
            }}
          >
            Entfernen
          </button>
        )}
      </div>

      {result && (
        <div className={`tip${result.ok ? '' : ' warn'}`} style={{ marginTop: 10 }}>
          <span>{result.ok ? '✅' : '⚠️'}</span>
          <span>{result.message}</span>
        </div>
      )}

      {active && (
        <div className="hint" style={{ marginTop: 10 }}>
          Heute: {usage.requests} Anfragen · {formatShort(usage.inputTokens + usage.outputTokens)} Tokens
          {usage.errors > 0 ? ` · ${usage.errors} Fehler` : ''}
          {usage.lastError ? ` · zuletzt: ${usage.lastError}` : ''}
        </div>
      )}
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
