import { useEffect, useMemo, useRef, useState } from 'react';
import { hasSave } from './sim/persistence';
import { resetWorld, resumeWorld, saveNow, setSaveListener, setSpeed, useWorld } from './sim/store';
import type { Account, World } from './sim/types';
import Composer from './ui/Composer';
import Explore from './ui/Explore';
import Feed from './ui/Feed';
import Insights from './ui/Insights';
import Messages from './ui/Messages';
import Notifications from './ui/Notifications';
import Onboarding from './ui/Onboarding';
import PostDetail from './ui/PostDetail';
import Profile from './ui/Profile';
import Rail from './ui/Rail';
import StoryViewer from './ui/StoryViewer';
import { Avatar, Modal, clockOf, followersOf, formatShort } from './ui/common';

type Tab = 'feed' | 'explore' | 'notifications' | 'messages' | 'insights' | 'profile';

const SPEEDS = [
  { label: '❚❚', value: 0, title: 'Pause' },
  { label: '1×', value: 5, title: '5 Simulationsminuten pro Sekunde' },
  { label: '4×', value: 20, title: '20 Simulationsminuten pro Sekunde' },
  { label: '12×', value: 60, title: '1 Stunde pro Sekunde' },
  { label: '48×', value: 240, title: '4 Stunden pro Sekunde' },
];

export default function App() {
  const world = useWorld();
  const [booting, setBooting] = useState(() => hasSave());
  const [bootProgress, setBootProgress] = useState(0);
  const bootStarted = useRef(false);
  const [tab, setTab] = useState<Tab>('feed');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [stories, setStories] = useState<{ list: Account[]; index: number } | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Gespeicherten Stand automatisch fortsetzen - in Haeppchen, damit die
  // Anzeige mitlaeuft, wenn viel Zeit nachgeholt werden muss.
  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    if (!hasSave()) {
      setBooting(false);
      return;
    }
    void resumeWorld(setBootProgress).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    setSaveListener((ok, message) => {
      if (message && !ok) setToast(message);
    });
    return () => setSaveListener(undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (booting) {
    return <BootScreen progress={bootProgress} />;
  }

  if (!world) {
    return (
      <Onboarding
        canResume={hasSave()}
        onResume={() => {
          setBooting(true);
          void resumeWorld(setBootProgress).finally(() => setBooting(false));
        }}
      />
    );
  }

  const user = world.accounts[world.user.accountId];
  const unreadNotifs = world.notifications.filter((n) => !n.read).length;
  const unreadDms = world.threadOrder.filter((id) => world.threads[id]?.unread).length;

  const goProfile = (id: string) => {
    setProfileId(id);
    setTab('profile');
    setTag(null);
  };
  const goTag = (t: string | null) => {
    setTag(t);
    if (t) setTab('explore');
  };

  const post = openPost ? world.posts[openPost] : null;

  const content = (() => {
    switch (tab) {
      case 'explore':
        return <Explore world={world} onProfile={goProfile} onOpen={setOpenPost} tag={tag} onTag={goTag} />;
      case 'notifications':
        return <Notifications world={world} onProfile={goProfile} onOpen={setOpenPost} />;
      case 'messages':
        return <Messages world={world} onProfile={goProfile} />;
      case 'insights':
        return <Insights world={world} onOpen={setOpenPost} />;
      case 'profile':
        return (
          <Profile
            world={world}
            accountId={profileId ?? user.id}
            onProfile={goProfile}
            onOpen={setOpenPost}
            onCompose={() => setComposing(true)}
          />
        );
      default:
        return (
          <Feed
            world={world}
            onProfile={goProfile}
            onOpen={setOpenPost}
            onTag={(t) => goTag(t)}
            onStories={(list, index) => setStories({ list, index })}
            onCompose={() => setComposing(true)}
          />
        );
    }
  })();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">Fotogram</div>
        <NavButton icon="⌂" label="Startseite" active={tab === 'feed'} onClick={() => { setTab('feed'); setTag(null); }} />
        <NavButton icon="⌕" label="Entdecken" active={tab === 'explore'} onClick={() => setTab('explore')} />
        <NavButton icon="✉" label="Nachrichten" active={tab === 'messages'} badge={unreadDms} onClick={() => setTab('messages')} />
        <NavButton icon="♡" label="Aktivitaeten" active={tab === 'notifications'} badge={unreadNotifs} onClick={() => setTab('notifications')} />
        <NavButton icon="✎" label="Erstellen" active={false} onClick={() => setComposing(true)} />
        <NavButton icon="▤" label="Statistiken" active={tab === 'insights'} onClick={() => setTab('insights')} />
        <NavButton icon="☺" label="Profil" active={tab === 'profile' && profileId === user.id} onClick={() => goProfile(user.id)} />

        <div className="sidebar-footer">
          <Clock world={world} />
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <span className="icon">⚙</span> Einstellungen
          </button>
        </div>
      </nav>

      <div className="main-col">
        <header className="topbar">
          <div className="brand" style={{ padding: 0, fontSize: 22 }}>Fotogram</div>
          <div className="row">
            <span className="small faint">{formatShort(followersOf(user))} Follower</span>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen">⚙</button>
          </div>
        </header>

        <div className={tab === 'feed' ? 'with-rail' : 'center'}>
          <div style={{ minWidth: 0 }}>{content}</div>
          {tab === 'feed' && <Rail world={world} onProfile={goProfile} onTag={(t) => goTag(t)} />}
        </div>
      </div>

      <nav className="mobile-bar">
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => { setTab('feed'); setTag(null); }} aria-label="Startseite">⌂</button>
        <button className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')} aria-label="Entdecken">⌕</button>
        <button onClick={() => setComposing(true)} aria-label="Erstellen">✎</button>
        <button className={tab === 'insights' ? 'active' : ''} onClick={() => setTab('insights')} aria-label="Statistiken">▤</button>
        <button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')} aria-label="Aktivitaeten">
          ♡{unreadNotifs > 0 && <span className="badge-dot" style={{ left: 'auto', right: 2, top: 0 }}>{unreadNotifs > 99 ? '99' : unreadNotifs}</span>}
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => goProfile(user.id)} aria-label="Profil">
          <Avatar spec={user.avatar} size={22} />
        </button>
      </nav>

      {composing && (
        <Modal onClose={() => setComposing(false)} title="Neuer Beitrag">
          <Composer
            world={world}
            onDone={(id) => {
              setComposing(false);
              setOpenPost(id);
              setToast('Beitrag veroeffentlicht. Der Algorithmus testet ihn jetzt.');
            }}
          />
        </Modal>
      )}

      {post && <PostDetail post={post} world={world} onClose={() => setOpenPost(null)} onProfile={goProfile} />}

      {stories && (
        <StoryViewer
          accounts={stories.list}
          startIndex={stories.index}
          world={world}
          onClose={() => setStories(null)}
          onProfile={(id) => {
            setStories(null);
            goProfile(id);
          }}
        />
      )}

      {settingsOpen && <Settings world={world} onClose={() => setSettingsOpen(false)} onToast={setToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** Ladeansicht, waehrend ein Spielstand geladen und aufgeholt wird. */
function BootScreen({ progress }: { progress: number }) {
  return (
    <div className="onboard">
      <div className="card onboard-card" style={{ padding: 26, textAlign: 'center' }}>
        <div className="brand" style={{ padding: 0, fontSize: 32 }}>Fotogram</div>
        <p className="muted small">Dein Spielstand wird geladen. Die Welt hat ohne dich weitergemacht.</p>
        <div className="meter" style={{ marginTop: 14 }}>
          <span style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      <span className="icon">{icon}</span>
      {label}
      {badge ? <span className="badge-dot">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}

function Clock({ world }: { world: World }) {
  const { day, label } = useMemo(() => clockOf(world), [world.time]);
  const speed = world.settings.paused ? 0 : world.settings.speed;
  return (
    <div className="clock">
      <div className="clock-time">
        <span>Tag {day}</span>
        <span>{label}</span>
      </div>
      <div className="clock-sub">
        {world.settings.paused ? 'Simulation pausiert' : `${Object.keys(world.accounts).length} Accounts aktiv`}
      </div>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            className={`speed-btn${speed === s.value ? ' active' : ''}`}
            title={s.title}
            onClick={() => setSpeed(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Settings({
  world,
  onClose,
  onToast,
}: {
  world: World;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { day, label } = clockOf(world);
  const user = world.accounts[world.user.accountId];

  return (
    <Modal onClose={onClose} narrow title="Einstellungen">
      <div className="modal-body">
        <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="stat">
            <div className="k">Simulationszeit</div>
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
          Die Welt laeuft auch weiter, wenn du das Fenster schliesst - beim naechsten Oeffnen wird die vergangene Zeit
          nachgeholt (maximal drei simulierte Tage).
        </div>

        <span className="label">Spielstand</span>
        <button
          className="btn secondary full"
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
              Damit werden dein Account, alle Beitraege und die gesamte Welt geloescht. Das laesst sich nicht rueckgaengig
              machen.
            </p>
            <div className="row">
              <button className="btn secondary sm" onClick={() => setConfirming(false)}>Abbrechen</button>
              <button className="btn sm" style={{ background: 'var(--red)' }} onClick={() => resetWorld()}>
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
          Fotogram ist eine Simulation. Alle Accounts, Bilder und Kommentare werden lokal in deinem Browser erzeugt - es
          gibt keinen Server und keine echten Personen.
        </div>
      </div>
    </Modal>
  );
}
