import { useMemo } from 'react';
import { toggleFollow } from '../sim/actions';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { AccountAvatar } from './Media';
import ScreenHeader from './Screen';
import { Verified, followersOf, formatShort } from './common';

/** Follower- oder Abo-Liste eines Accounts. */
export default function People({
  world,
  accountId,
  mode,
  onBack,
  onProfile,
}: {
  world: World;
  accountId: string;
  mode: 'followers' | 'following';
  onBack: () => void;
  onProfile: (id: string) => void;
}) {
  const account = world.accounts[accountId];
  const user = world.accounts[world.user.accountId];

  const list = useMemo(() => {
    if (!account) return [];
    const ids = mode === 'followers' ? account.realFollowers : account.following;
    return [...new Set(ids)].map((id) => world.accounts[id]).filter(Boolean).slice(0, 200);
  }, [accountId, mode, world.time]);

  if (!account) return null;
  const hidden = mode === 'followers' ? account.crowdFollowers : account.crowdFollowing;

  return (
    <div className="screen">
      <ScreenHeader
        title={mode === 'followers' ? 'Follower' : 'Abonniert'}
        subtitle={`@${account.handle}`}
        onBack={onBack}
      />
      <div className="screen-body">
        {list.length === 0 && <div className="empty small">Hier ist noch niemand.</div>}
        {list.map((a) => {
          const follows = user.following.includes(a.id);
          return (
            <div className="row list-row" key={a.id}>
              <button className="plain-btn" onClick={() => onProfile(a.id)}>
                <AccountAvatar account={a} size={44} />
              </button>
              <button className="plain-btn grow" onClick={() => onProfile(a.id)}>
                <div className="post-handle">
                  {a.handle} <Verified on={a.verified} />
                </div>
                <div className="post-sub">
                  {a.name} · {formatShort(followersOf(a))} Follower
                </div>
              </button>
              {!a.isUser && (
                <button
                  className={`btn sm${follows ? ' secondary' : ''}`}
                  onClick={() => dispatch((w) => toggleFollow(w, a.id))}
                >
                  {follows ? 'Gefolgt' : 'Folgen'}
                </button>
              )}
            </div>
          );
        })}
        {hidden > 0 && (
          <div className="hint center-text" style={{ marginTop: 14 }}>
            und {formatShort(hidden)} weitere Personen
          </div>
        )}
      </div>
    </div>
  );
}
