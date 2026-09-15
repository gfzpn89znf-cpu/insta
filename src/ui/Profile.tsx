import { useMemo, useState } from 'react';
import { toggleFollow } from '../sim/actions';
import { NICHES } from '../sim/niches';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { GridTile } from './PostCard';
import { AccountAvatar } from './Media';
import ScreenHeader from './Screen';
import { LineChart, Verified, followersOf, followingOf, formatFull, formatShort } from './common';

export default function Profile({
  world,
  accountId,
  onBack,
  onOpen,
  onPeople,
  onCompose,
  onEdit,
  onChat,
  onCall,
  showBack,
}: {
  world: World;
  accountId: string;
  onBack: () => void;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onPeople: (id: string, mode: 'followers' | 'following') => void;
  onCompose: () => void;
  onEdit: () => void;
  onChat: (id: string) => void;
  onCall: (id: string, video: boolean) => void;
  showBack: boolean;
}) {
  const account = world.accounts[accountId];
  const user = world.accounts[world.user.accountId];
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');

  const posts = useMemo(
    () => (account ? account.postIds.map((id) => world.posts[id]).filter(Boolean).reverse() : []),
    [account?.postIds.length, world.time, accountId],
  );
  const saved = useMemo(
    () => world.user.savedPosts.map((id) => world.posts[id]).filter(Boolean).reverse(),
    [world.user.savedPosts.length, world.time],
  );

  if (!account) return <div className="empty">Dieser Account existiert nicht mehr.</div>;
  const isMe = account.isUser;
  const follows = user.following.includes(account.id);
  const followsBack = account.following.includes(user.id);
  const shown = tab === 'saved' ? saved : posts;

  return (
    <div className="screen">
      {showBack ? (
        <ScreenHeader
          title={account.handle}
          subtitle={account.verified ? 'Verifiziert' : undefined}
          onBack={onBack}
          right={
            isMe ? (
              <button className="icon-btn" onClick={onEdit} aria-label="Profil bearbeiten">⚙</button>
            ) : undefined
          }
        />
      ) : null}

      <div className="screen-body">
        <header className="profile-head">
          <AccountAvatar account={account} size={104} />
          <div className="profile-main">
            <div className="profile-stats">
              <span><b>{formatFull(account.postsTotal)}</b> Beitraege</span>
              <button className="plain-btn" onClick={() => onPeople(account.id, 'followers')}>
                <b>{formatFull(followersOf(account))}</b> Follower
              </button>
              <button className="plain-btn" onClick={() => onPeople(account.id, 'following')}>
                <b>{formatFull(followingOf(account))}</b> abonniert
              </button>
            </div>
          </div>
        </header>

        <div className="profile-bio">
          <b>
            {account.name} <Verified on={account.verified} />
          </b>
          <div className="muted">{account.bio}</div>
          <div className="small faint" style={{ marginTop: 6 }}>
            {NICHES[account.niche].emoji} {NICHES[account.niche].label}
            {account.streak > 1 ? ` · ${account.streak} Tage Serie` : ''}
            {account.momentum > 0 ? ` · +${formatShort(Math.round(account.momentum))} Follower/Tag` : ''}
          </div>
        </div>

        <div className="profile-actions">
          {isMe ? (
            <>
              <button className="btn secondary" onClick={onEdit}>Profil bearbeiten</button>
              <button className="btn grad" onClick={onCompose}>Beitrag erstellen</button>
            </>
          ) : (
            <>
              <button
                className={`btn${follows ? ' secondary' : ''}`}
                onClick={() => dispatch((w) => toggleFollow(w, account.id))}
              >
                {follows ? 'Gefolgt' : followsBack ? 'Zurueckfolgen' : 'Folgen'}
              </button>
              <button className="btn secondary" onClick={() => onChat(account.id)}>Nachricht</button>
              <button className="btn secondary icon-only" onClick={() => onCall(account.id, false)} aria-label="Anrufen" title="Anrufen">
                📞
              </button>
              <button className="btn secondary icon-only" onClick={() => onCall(account.id, true)} aria-label="Videoanruf" title="Videoanruf">
                📹
              </button>
            </>
          )}
        </div>
        {!isMe && followsBack && <span className="pill">folgt dir</span>}

        {account.history.length > 3 && (
          <div className="card" style={{ padding: 14, margin: '14px 0' }}>
            <div className="small muted" style={{ marginBottom: 6 }}>Followerentwicklung</div>
            <LineChart points={account.history.map((h) => ({ x: h.t, y: h.followers }))} height={140} />
          </div>
        )}

        <div className="tabs">
          <button className={`tab${tab === 'posts' ? ' active' : ''}`} onClick={() => setTab('posts')}>
            Beitraege
          </button>
          {isMe && (
            <button className={`tab${tab === 'saved' ? ' active' : ''}`} onClick={() => setTab('saved')}>
              Gespeichert
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            {isMe && tab === 'posts' ? (
              <>
                <p>Du hast noch nichts veroeffentlicht.</p>
                <button className="btn grad" onClick={onCompose}>Ersten Beitrag erstellen</button>
              </>
            ) : (
              <p>Nichts vorhanden.</p>
            )}
          </div>
        ) : (
          <div className="grid" style={{ marginTop: 4 }}>
            {shown.map((p) => (
              <GridTile key={p.id} post={p} onOpen={onOpen} stockEnabled={world.settings.stockPhotos} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
