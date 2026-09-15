import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSave } from './sim/persistence';
import { pickIncomingCaller } from './sim/calls';
import { requestPersistentStorage } from './sim/db';
import { getPrivacy, hasLock, lockNow, lockState, onPrivacyChange } from './sim/privacy';
import { resumeWorld, saveNow, setSaveListener, setSpeed, useWorld } from './sim/store';
import type { World } from './sim/types';
import Call from './ui/Call';
import Chat from './ui/Chat';
import Composer from './ui/Composer';
import Explore from './ui/Explore';
import Feed from './ui/Feed';
import Hashtag from './ui/Hashtag';
import Insights from './ui/Insights';
import Messages from './ui/Messages';
import Notifications from './ui/Notifications';
import Onboarding from './ui/Onboarding';
import People from './ui/People';
import PostDetail from './ui/PostDetail';
import Profile from './ui/Profile';
import Lock from './ui/Lock';
import Reels from './ui/Reels';
import Rail from './ui/Rail';
import Settings from './ui/Settings';
import StoryViewer from './ui/StoryViewer';
import { AccountAvatar, setStockPhotosAllowed } from './ui/Media';
import { isOverlay, useNavigation, type Navigation, type View } from './ui/nav';
import { clockOf, followersOf, formatShort } from './ui/common';

export const SPEEDS = [
  { label: '❚❚', value: 0, title: 'Pause' },
  { label: '1×', value: 5, title: '5 Simulationsminuten pro Sekunde' },
  { label: '4×', value: 20, title: '20 Simulationsminuten pro Sekunde' },
  { label: '12×', value: 60, title: '1 Stunde pro Sekunde' },
  { label: '48×', value: 240, title: '4 Stunden pro Sekunde' },
];

export default function App() {
  const world = useWorld();
  const nav = useNavigation();
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const bootStarted = useRef(false);
  const lastIncoming = useRef(0);
  const [locked, setLocked] = useState(() => lockState() === 'locked');

  // Sperre beobachten: sie kann auch von den Einstellungen aus umgelegt werden.
  useEffect(() => onPrivacyChange(() => setLocked(lockState() === 'locked')), []);

  // Gespeicherten Stand fortsetzen - in Haeppchen, damit die Anzeige mitlaeuft.
  // Erst nach dem Entsperren, sonst laesst sich nichts entschluesseln.
  useEffect(() => {
    if (locked || bootStarted.current) return;
    bootStarted.current = true;
    void (async () => {
      void requestPersistentStorage();
      if (await hasSave()) await resumeWorld(setBootProgress);
      setBooting(false);
    })();
  }, [locked]);

  useEffect(() => {
    setSaveListener((ok, message) => {
      if (message && !ok) setToast(message);
    });
    return () => setSaveListener(undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Gelegentlich ruft jemand von sich aus an.
  useEffect(() => {
    if (!world) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (nav.top.kind === 'call' || Date.now() - lastIncoming.current < 180000) return;
      const caller = pickIncomingCaller(world);
      if (caller) {
        lastIncoming.current = Date.now();
        nav.go({ kind: 'call', accountId: caller, video: false, incoming: true });
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [world, nav]);

  if (locked) {
    return (
      <Lock
        mode="unlock"
        onDone={() => {
          setLocked(false);
          setBooting(true);
        }}
      />
    );
  }
  if (booting) return <BootScreen progress={bootProgress} />;
  if (!world) return <Onboarding onStarted={() => setBooting(false)} />;

  return <Shell world={world} nav={nav} toast={toast} setToast={setToast} />;
}

function Shell({
  world,
  nav,
  toast,
  setToast,
}: {
  world: World;
  nav: Navigation;
  toast: string | null;
  setToast: (value: string | null) => void;
}) {
  const user = world.accounts[world.user.accountId];
  setStockPhotosAllowed(world.settings.stockPhotos);
  const unreadNotifs = world.notifications.filter((n) => !n.read).length;
  const unreadDms = world.threadOrder.filter((id) => world.threads[id]?.unread).length;

  useAutoLock();
  const shaded = usePrivacyShade();

  const openProfile = useCallback((id: string) => nav.go({ kind: 'profile', id }), [nav]);
  const openPost = useCallback((id: string) => nav.go({ kind: 'post', id }), [nav]);
  const openTag = useCallback((tag: string) => nav.go({ kind: 'hashtag', tag }), [nav]);
  const openChat = useCallback((id: string) => nav.go({ kind: 'chat', accountId: id }), [nav]);
  const openCall = useCallback(
    (id: string, video: boolean) => nav.go({ kind: 'call', accountId: id, video }),
    [nav],
  );

  const renderView = (view: View) => {
    switch (view.kind) {
      case 'explore':
        return <Explore world={world} onProfile={openProfile} onOpen={openPost} onTag={openTag} />;
      case 'reels':
        return (
          <Reels
            world={world}
            onProfile={openProfile}
            onOpen={openPost}
            onTag={openTag}
            onCreate={() => nav.go({ kind: 'composer' })}
          />
        );
      case 'notifications':
        return <Notifications world={world} onProfile={openProfile} onOpen={openPost} />;
      case 'messages':
        return <Messages world={world} onOpenChat={openChat} />;
      case 'insights':
        return <Insights world={world} onOpen={openPost} />;
      case 'profile':
        return (
          <Profile
            world={world}
            accountId={view.id}
            onBack={nav.back}
            onProfile={openProfile}
            onOpen={openPost}
            onPeople={(id, mode) => nav.go({ kind: 'people', id, mode })}
            onCompose={() => nav.go({ kind: 'composer' })}
            onEdit={() => nav.go({ kind: 'editProfile' })}
            onChat={openChat}
            onCall={openCall}
            showBack={nav.canGoBack}
          />
        );
      case 'people':
        return <People world={world} accountId={view.id} mode={view.mode} onBack={nav.back} onProfile={openProfile} />;
      case 'hashtag':
        return <Hashtag world={world} tag={view.tag} onBack={nav.back} onOpen={openPost} />;
      case 'chat':
        return <Chat world={world} accountId={view.accountId} onBack={nav.back} onProfile={openProfile} onCall={openCall} />;
      case 'settings':
        return <Settings world={world} onBack={nav.back} onToast={setToast} />;
      case 'editProfile':
        return <Settings world={world} onBack={nav.back} onToast={setToast} profileOnly />;
      case 'feed':
      default:
        return (
          <Feed
            world={world}
            onProfile={openProfile}
            onOpen={openPost}
            onTag={openTag}
            onStories={(ids, index) => nav.go({ kind: 'stories', ids, index })}
            onCompose={() => nav.go({ kind: 'composer' })}
          />
        );
    }
  };

  const top = nav.top;
  const overlay = isOverlay(top);

  // Escape schliesst jede Ueberlagerung - erwartet auf dem Rechner.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') nav.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, nav]);
  const background = overlay ? (nav.below ?? { kind: 'feed' as const }) : top;
  // In Chat und Anruf stoert die Reiterleiste nur.
  const hideTabs = overlay || top.kind === 'chat';
  const fullBleed =
    top.kind === 'chat' || top.kind === 'people' || top.kind === 'settings' || top.kind === 'editProfile' || top.kind === 'reels';

  return (
    <div className={`app${shaded ? ' shaded' : ''}`}>
      <nav className="sidebar">
        <div className="brand">Fotogram</div>
        <NavButton icon="⌂" label="Startseite" active={nav.tab === 'feed'} onClick={() => nav.goTab('feed')} />
        <NavButton icon="⌕" label="Entdecken" active={nav.tab === 'explore'} onClick={() => nav.goTab('explore')} />
        <NavButton icon="▶" label="Reels" active={nav.tab === 'reels'} onClick={() => nav.goTab('reels')} />
        <NavButton icon="✉" label="Nachrichten" active={nav.tab === 'messages'} badge={unreadDms} onClick={() => nav.goTab('messages')} />
        <NavButton icon="♡" label="Aktivitaeten" active={nav.tab === 'notifications'} badge={unreadNotifs} onClick={() => nav.goTab('notifications')} />
        <NavButton icon="✎" label="Erstellen" active={false} onClick={() => nav.go({ kind: 'composer' })} />
        <NavButton icon="▤" label="Statistiken" active={nav.tab === 'insights'} onClick={() => nav.goTab('insights')} />
        <NavButton icon="☺" label="Profil" active={top.kind === 'profile' && top.id === user.id} onClick={() => nav.go({ kind: 'profile', id: user.id })} />
        <div className="sidebar-footer">
          <Clock world={world} />
          <button className="nav-item" onClick={() => nav.go({ kind: 'settings' })}>
            <span className="icon">⚙</span> Einstellungen
          </button>
        </div>
      </nav>

      <div className={`main-col${fullBleed ? ' flush' : ''}`}>
        {!fullBleed && (
          <header className="topbar">
            <div className="brand" style={{ padding: 0, fontSize: 22 }}>Fotogram</div>
            <div className="row">
              <span className="small faint">{formatShort(followersOf(user))} Follower</span>
              <button
                className="icon-btn badge-host"
                onClick={() => nav.goTab('messages')}
                aria-label="Nachrichten"
              >
                ✉{unreadDms > 0 && <span className="badge-dot tab">{unreadDms > 9 ? '9+' : unreadDms}</span>}
              </button>
              <button className="icon-btn" onClick={() => nav.go({ kind: 'settings' })} aria-label="Einstellungen">⚙</button>
            </div>
          </header>
        )}

        <div className={nav.tab === 'feed' && background.kind === 'feed' ? 'with-rail' : 'center'}>
          <div style={{ minWidth: 0 }}>{renderView(background)}</div>
          {nav.tab === 'feed' && background.kind === 'feed' && (
            <Rail world={world} onProfile={openProfile} onTag={openTag} />
          )}
        </div>
      </div>

      {!hideTabs && (
        <nav className="mobile-bar">
          <TabButton label="Startseite" active={nav.tab === 'feed'} onClick={() => nav.goTab('feed')} icon="⌂" />
          <TabButton label="Entdecken" active={nav.tab === 'explore'} onClick={() => nav.goTab('explore')} icon="⌕" />
          <TabButton label="Reels" active={nav.tab === 'reels'} onClick={() => nav.goTab('reels')} icon="▶" />
          <TabButton label="Erstellen" active={false} onClick={() => nav.go({ kind: 'composer' })} icon="✎" />
          <TabButton label="Aktivitaeten" active={nav.tab === 'notifications'} badge={unreadNotifs} onClick={() => nav.goTab('notifications')} icon="♡" />
          <button
            className={top.kind === 'profile' && top.id === user.id ? 'active' : ''}
            onClick={() => nav.go({ kind: 'profile', id: user.id })}
            aria-label="Profil"
          >
            <AccountAvatar account={user} size={24} />
          </button>
        </nav>
      )}

      {overlay && (
        <div className={`overlay ${top.kind === 'call' || top.kind === 'stories' ? 'full' : 'sheet'}`}>
          {top.kind === 'post' && world.posts[top.id] && (
            <PostDetail
              post={world.posts[top.id]}
              world={world}
              onClose={nav.back}
              onProfile={openProfile}
            />
          )}
          {top.kind === 'composer' && (
            <Composer
              world={world}
              onClose={nav.back}
              onDone={(id) => {
                nav.back();
                window.setTimeout(() => openPost(id), 60);
                setToast('Beitrag veroeffentlicht. Der Algorithmus testet ihn jetzt.');
              }}
            />
          )}
          {top.kind === 'stories' && (
            <StoryViewer
              world={world}
              ids={top.ids}
              startIndex={top.index}
              onClose={nav.back}
              onProfile={(id) => {
                nav.back();
                window.setTimeout(() => openProfile(id), 60);
              }}
            />
          )}
          {top.kind === 'call' && (
            <Call
              world={world}
              accountId={top.accountId}
              video={top.video}
              incoming={top.incoming}
              onClose={nav.back}
            />
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {shaded && (
        <div className="privacy-shade" aria-hidden="true">
          <div className="brand" style={{ padding: 0, fontSize: 30 }}>Fotogram</div>
        </div>
      )}
    </div>
  );
}

/**
 * Sperrt wieder, wenn die App lange genug im Hintergrund war. Die Zeit
 * laeuft ab dem Moment, in dem das Fenster verschwindet.
 */
function useAutoLock() {
  useEffect(() => {
    if (!hasLock()) return;
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        // "Sofort" heisst wirklich sofort - der Schluessel geht raus, bevor
        // ein anderes Fenster nach vorne kommt.
        if (getPrivacy().autoLockMinutes === 0) lockNow();
        return;
      }
      const minutes = getPrivacy().autoLockMinutes;
      if (hiddenAt && Date.now() - hiddenAt >= minutes * 60000) lockNow();
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pagehide', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pagehide', onChange);
    };
  }, []);
}

/**
 * Sichtschutz: sobald die App in den Hintergrund geht, legt sich eine
 * Milchglasscheibe darueber. Damit steht im App-Umschalter des Handys kein
 * lesbares Vorschaubild deiner Beitraege.
 */
function usePrivacyShade() {
  const [shaded, setShaded] = useState(false);
  useEffect(() => {
    const hide = () => setShaded(true);
    const sync = () => setShaded(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
  return shaded;
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

function TabButton({
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
    <button className={active ? 'active' : ''} onClick={onClick} aria-label={label}>
      {icon}
      {badge ? <span className="badge-dot tab">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

export function Clock({ world }: { world: World }) {
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

export { saveNow };
