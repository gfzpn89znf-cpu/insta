import { useMemo } from 'react';
import { activeStories, buildFeed, suggestions } from '../sim/feed';
import { toggleFollow } from '../sim/actions';
import { dispatch } from '../sim/store';
import type { Account, World } from '../sim/types';
import PostCard from './PostCard';
import { AccountAvatar, StoryAvatar, Verified, followersOf, formatShort } from './common';

interface Props {
  world: World;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
  onStories: (ids: string[], index: number) => void;
  onCompose: () => void;
}

export default function Feed({ world, onProfile, onOpen, onTag, onStories, onCompose }: Props) {
  const user = world.accounts[world.user.accountId];
  // Neu berechnen, sobald sich die Welt bewegt.
  const posts = useMemo(() => buildFeed(world, { limit: 30 }), [world.time, user.following.length]);
  const stories = useMemo(() => activeStories(world), [world.time]);
  const people = useMemo(() => suggestions(world, 5), [world.time, user.following.length]);

  return (
    <div>
      {stories.length > 0 && (
        <div className="stories">
          {stories.map((a, i) => (
            <button key={a.id} className="story" onClick={() => onStories(stories.map((s) => s.id), i)}>
              <StoryAvatar account={a} world={world} size={58} />
              <span className="story-name">{a.handle}</span>
            </button>
          ))}
        </div>
      )}

      {user.following.length === 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <b>Folge ein paar Accounts</b>
          <p className="muted small">
            Dein Feed lebt von den Menschen, denen du folgst. Kommentiere unter grossen Accounts - das ist der schnellste
            Weg, selbst entdeckt zu werden.
          </p>
          <div style={{ marginTop: 10 }}>
            {people.map((a) => (
              <SuggestionRow key={a.id} account={a} world={world} onProfile={onProfile} />
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="empty">
          <p>Noch ist es still hier.</p>
          <button className="btn grad" onClick={onCompose}>Ersten Beitrag erstellen</button>
        </div>
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} world={world} onProfile={onProfile} onOpen={onOpen} onTag={onTag} />
        ))
      )}
    </div>
  );
}

export function SuggestionRow({
  account,
  world,
  onProfile,
}: {
  account: Account;
  world: World;
  onProfile: (id: string) => void;
}) {
  const user = world.accounts[world.user.accountId];
  const follows = user.following.includes(account.id);
  return (
    <div className="row" style={{ padding: '7px 0' }}>
      <span onClick={() => onProfile(account.id)} style={{ cursor: 'pointer', display: 'flex' }}>
        <AccountAvatar account={account} size={34} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="post-handle" style={{ cursor: 'pointer' }} onClick={() => onProfile(account.id)}>
          {account.handle} <Verified on={account.verified} />
        </div>
        <div className="post-sub">{formatShort(followersOf(account))} Follower</div>
      </div>
      <button className="btn ghost sm" onClick={() => dispatch((w) => toggleFollow(w, account.id))}>
        {follows ? 'Entfolgen' : 'Folgen'}
      </button>
    </div>
  );
}
