import { useEffect, useRef, useState } from 'react';
import { updateProfile } from '../sim/actions';
import { AI_MODELS, getAiSettings, getUsage, onAiChange, setAiSettings, testAiKey } from '../sim/ai';
import { storageEstimate } from '../sim/db';
import { queryFor, searchImages, searchVideos, type MediaHit } from '../sim/media';
import { portraitUrl } from '../sim/photos';
import { importPhoto, pruneOrphanPhotos } from '../sim/photos';
import {
  AUTOLOCK_CHOICES,
  getPrivacy,
  hasLock,
  lockAvailable,
  lockNow,
  onPrivacyChange,
  removePin,
  setPrivacy,
  wipeEverything,
} from '../sim/privacy';
import { dispatch, resetWorld, saveNow, setSpeed } from '../sim/store';
import type { World } from '../sim/types';
import { SPEEDS } from '../App';
import Lock from './Lock';
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
                  Laedt Fotos aus dem Netz. Ohne Verbindung - und im Privatmodus - zeichnet die App die Bilder selbst.
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

            <div className="section-title">Sicherheit und Privatsphaere</div>
            <PrivacySection onToast={onToast} />

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
                  Damit werden dein Account, alle Beitraege, alle hochgeladenen Fotos und Videos, deine PIN und dein
                  KI-Schluessel von diesem Geraet geloescht. Das laesst sich nicht rueckgaengig machen.
                </p>
                <div className="row">
                  <button className="btn secondary sm" onClick={() => setConfirming(false)}>Abbrechen</button>
                  <button
                    className="btn sm danger"
                    onClick={() => {
                      void wipeEverything().then(() => void resetWorld());
                    }}
                  >
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
              es gibt keinen Server und keine echten Personen. Deine Fotos werden nirgendwo hochgeladen.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sicherheit und Privatsphaere an einer Stelle: die Sperre, der Privatmodus
 * und eine ehrliche Auskunft darueber, was das Geraet ueberhaupt verlaesst.
 */
function PrivacySection({ onToast }: { onToast: (msg: string) => void }) {
  const [privacy, setLocal] = useState(getPrivacy);
  const [locked, setLocked] = useState(hasLock);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() =>
    onPrivacyChange(() => {
      setLocal(getPrivacy());
      setLocked(hasLock());
    }),
  []);

  const change = (patch: Parameters<typeof setPrivacy>[0]) => {
    setPrivacy(patch);
    setLocal(getPrivacy());
  };

  if (creating) {
    return (
      <Lock
        mode="create"
        onDone={() => {
          setCreating(false);
          setLocked(true);
          onToast('Die App ist jetzt mit deiner PIN verschluesselt.');
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <b>{locked ? '🔒 Mit PIN verschluesselt' : '🔓 Ohne PIN'}</b>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {locked
          ? 'Spielstand, Fotos und Videos liegen verschluesselt auf dem Geraet. Ohne deine PIN sind sie nicht lesbar - auch nicht fuer jemanden, der dein Handy in der Hand hat.'
          : 'Setze eine PIN, dann werden dein Spielstand und alle hochgeladenen Fotos und Videos auf dem Geraet verschluesselt (AES-256).'}
      </p>

      {!lockAvailable() && (
        <div className="tip warn">
          <span>⚠️</span>
          <span>Dieser Browser bietet keine Verschluesselung an. Oeffne die App ueber eine https-Adresse.</span>
        </div>
      )}

      {locked ? (
        <>
          <span className="label">Automatisch sperren</span>
          <select
            className="select"
            id="privacy-autolock"
            value={privacy.autoLockMinutes}
            onChange={(e) => change({ autoLockMinutes: Number(e.target.value) })}
          >
            {AUTOLOCK_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Sofort beim Verlassen' : m === 60 ? 'Nach 1 Stunde' : `Nach ${m} Minute${m === 1 ? '' : 'n'}`}
              </option>
            ))}
          </select>
          <div className="hint">
            Die Zeit laeuft, sobald du die App verlaesst. Solange gesperrt ist, liegt der Schluessel nirgends - auch
            nicht im Arbeitsspeicher.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn secondary sm" onClick={() => lockNow()}>
              Jetzt sperren
            </button>
            <button
              className="btn ghost sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void removePin().then((outcome) => {
                  setBusy(false);
                  setLocked(hasLock());
                  onToast(outcome.message);
                });
              }}
            >
              PIN entfernen
            </button>
          </div>
        </>
      ) : (
        <button className="btn grad full" disabled={!lockAvailable()} onClick={() => setCreating(true)}>
          PIN einrichten
        </button>
      )}

      <label className="switch-row" htmlFor="privacy-offline" style={{ marginTop: 14 }}>
        <span>
          <b>Privatmodus</b>
          <div className="hint" style={{ margin: 0 }}>
            Keine einzige Verbindung nach draussen: keine Fotos aus dem Netz, keine Profilbilder, keine KI. Alles wird
            auf dem Geraet gerechnet und gezeichnet.
          </div>
        </span>
        <input
          id="privacy-offline"
          type="checkbox"
          checked={privacy.offline}
          onChange={(e) => change({ offline: e.target.checked })}
        />
      </label>

      <label className="switch-row" htmlFor="privacy-vision">
        <span>
          <b>Bilderkennung erlauben</b>
          <div className="hint" style={{ margin: 0 }}>
            Nur mit diesem Haken schickt die App eine verkleinerte Fassung deines Fotos - bei Videos ein Standbild - an
            die KI, damit sie erkennt, worum es geht. Ohne Haken bleibt jedes Bild auf dem Geraet.
          </div>
        </span>
        <input
          id="privacy-vision"
          type="checkbox"
          checked={privacy.shareImages}
          disabled={privacy.offline}
          onChange={(e) => change({ shareImages: e.target.checked })}
        />
      </label>

      <details className="disclose">
        <summary>Was verlaesst dieses Geraet?</summary>
        <ul className="small muted">
          <li>
            <b>Deine Fotos und Videos: nie.</b> Sie liegen nur im Speicher deines Browsers. Fotogram hat keinen Server,
            auf den sie hochgeladen werden koennten - es gibt keinen Account, kein Login, keine Cloud.
          </li>
          <li>
            <b>Dein Spielstand, deine Chats, deine Beitraege: nie.</b> Alles wird auf dem Geraet berechnet.
          </li>
          <li>
            <b>Mit eingerichteter KI:</b> die Texte der Unterhaltung gehen verschluesselt an api.anthropic.com, damit
            dort eine Antwort entsteht. Bilder nur, wenn du oben die Bilderkennung erlaubst.
          </li>
          <li>
            <b>Mit „Echte Fotos der KI-Accounts":</b> es werden Suchbegriffe wie „meal prep" an commons.wikimedia.org
            geschickt und Bilder von dort geladen. Diese Dienste sehen dabei die IP-Adresse deines Anschlusses.
          </li>
          <li>
            <b>Der Privatmodus schaltet all das ab</b> - dann geht ueberhaupt nichts mehr raus.
          </li>
        </ul>
      </details>
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
