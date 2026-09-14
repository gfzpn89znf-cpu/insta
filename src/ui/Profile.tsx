import { useMemo, useState } from 'react';
import { toggleFollow, updateProfile } from '../sim/actions';
import { NICHES } from '../sim/niches';
import { dispatch } from '../sim/store';
import type { Account, World } from '../sim/types';
import { GridTile } from './PostCard';
import { SuggestionRow } from './Feed';
import { Avatar, LineChart, Modal, Verified, followersOf, followingOf, formatFull, formatShort, relTime } from './common';

export default function Profile({
  world,
  accountId,
  onProfile,
  onOpen,
  onCompose,
}: {
  world: World;
  accountId: string;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onCompose: () => void;
}) {
  const account = world.accounts[accountId];
  const user = world.accounts[world.user.accountId];
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const [listing, setListing] = useState<'followers' | 'following' | null>(null);
  const [editing, setEditing] = useState(false);

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
    <div style={{ paddingTop: 14 }}>
      <header className="profile-head">
        <Avatar spec={account.avatar} size={132} />
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 400 }}>
              {account.handle} <Verified on={account.verified} />
            </h2>
            {isMe ? (
              <>
                <button className="btn secondary sm" onClick={() => setEditing(true)}>Profil bearbeiten</button>
                <button className="btn grad sm" onClick={onCompose}>Beitrag erstellen</button>
              </>
            ) : (
              <>
                <button className={`btn sm${follows ? ' secondary' : ''}`} onClick={() => dispatch((w) => toggleFollow(w, account.id))}>
                  {follows ? 'Gefolgt' : followsBack ? 'Zurueckfolgen' : 'Folgen'}
                </button>
                {followsBack && <span className="pill">folgt dir</span>}
              </>
            )}
          </div>

          <div className="profile-stats">
            <span><b>{formatFull(account.postsTotal)}</b> Beitraege</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setListing('followers')}>
              <b>{formatFull(followersOf(account))}</b> Follower
            </span>
            <span style={{ cursor: 'pointer' }} onClick={() => setListing('following')}>
              <b>{formatFull(followingOf(account))}</b> abonniert
            </span>
          </div>

          <div className="profile-bio">
            <b>{account.name}</b>
            <div className="muted">{account.bio}</div>
            <div className="small faint" style={{ marginTop: 6 }}>
              {NICHES[account.niche].emoji} {NICHES[account.niche].label}
              {account.streak > 1 ? ` · ${account.streak} Tage Serie` : ''}
              {account.momentum > 0 ? ` · +${formatShort(Math.round(account.momentum))} Follower/Tag` : ''}
            </div>
          </div>
        </div>
      </header>

      {account.history.length > 3 && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
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
            <GridTile key={p.id} post={p} onOpen={onOpen} />
          ))}
        </div>
      )}

      {listing && (
        <FollowList
          world={world}
          account={account}
          kind={listing}
          onClose={() => setListing(null)}
          onProfile={(id) => {
            setListing(null);
            onProfile(id);
          }}
        />
      )}
      {editing && <EditProfile world={world} onClose={() => setEditing(false)} />}
    </div>
  );
}

function FollowList({
  world,
  account,
  kind,
  onClose,
  onProfile,
}: {
  world: World;
  account: Account;
  kind: 'followers' | 'following';
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const ids = kind === 'followers' ? account.realFollowers : account.following;
  const list = [...new Set(ids)].map((id) => world.accounts[id]).filter(Boolean).slice(0, 80);
  const hidden = (kind === 'followers' ? account.crowdFollowers : account.crowdFollowing);

  return (
    <Modal onClose={onClose} narrow title={kind === 'followers' ? 'Follower' : 'Abonniert'}>
      <div className="modal-body">
        {list.length === 0 && <div className="empty small">Noch niemand.</div>}
        {list.map((a) => (
          <SuggestionRow key={a.id} account={a} world={world} onProfile={onProfile} />
        ))}
        {hidden > 0 && (
          <div className="hint center-text" style={{ marginTop: 12 }}>
            und {formatShort(hidden)} weitere Personen
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditProfile({ world, onClose }: { world: World; onClose: () => void }) {
  const user = world.accounts[world.user.accountId];
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);

  const save = () => {
    dispatch((w) => updateProfile(w, { name, handle, bio }));
    onClose();
  };

  return (
    <Modal onClose={onClose} narrow title="Profil bearbeiten">
      <div className="modal-body">
        <span className="label">Name</span>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <span className="label">Benutzername</span>
        <input className="input" value={handle} maxLength={24} onChange={(e) => setHandle(e.target.value)} />
        <span className="label">Biografie</span>
        <textarea className="textarea" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} />
        <div className="hint">
          Eine klare Biografie erhoeht die Wahrscheinlichkeit, dass Profilbesucher dir auch folgen.
        </div>
        <button className="btn full" style={{ marginTop: 14 }} onClick={save}>Speichern</button>
        <div className="hint center-text" style={{ marginTop: 10 }}>
          Dabei seit {relTime(world, user.createdAt)}
        </div>
      </div>
    </Modal>
  );
}
