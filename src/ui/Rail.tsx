import { useMemo } from 'react';
import { leaderboard, risingStars, suggestions } from '../sim/feed';
import type { World } from '../sim/types';
import { SuggestionRow } from './Feed';
import { Avatar, Verified, followersOf, formatShort, relTime } from './common';

/** Rechte Spalte: dein Stand, Vorschlaege, Trends, Rangliste, Aktivitaeten. */
export default function Rail({
  world,
  onProfile,
  onTag,
}: {
  world: World;
  onProfile: (id: string) => void;
  onTag: (tag: string) => void;
}) {
  const user = world.accounts[world.user.accountId];
  const people = useMemo(() => suggestions(world, 5), [world.time, user.following.length]);
  const top = useMemo(() => leaderboard(world, 5), [world.time]);
  const rising = useMemo(() => risingStars(world, 4), [world.time]);
  const rank = useMemo(
    () =>
      Object.values(world.accounts)
        .sort((a, b) => followersOf(b) - followersOf(a))
        .findIndex((a) => a.isUser) + 1,
    [world.time],
  );

  return (
    <aside className="rail">
      <div className="row" style={{ marginBottom: 6 }}>
        <Avatar spec={user.avatar} size={46} />
        <div style={{ minWidth: 0 }}>
          <div className="post-handle" style={{ cursor: 'pointer' }} onClick={() => onProfile(user.id)}>
            {user.handle} <Verified on={user.verified} />
          </div>
          <div className="post-sub">
            {formatShort(followersOf(user))} Follower · Platz {rank} von {Object.keys(world.accounts).length}
          </div>
        </div>
      </div>

      {world.trends.length > 0 && (
        <>
          <div className="section-title">Trends gerade</div>
          <div className="chips">
            {world.trends.map((t) => (
              <button key={t.tag} className="chip hot" onClick={() => onTag(t.tag)}>
                #{t.tag} · {formatShort(t.posts)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Vorschlaege fuer dich</div>
      {people.map((a) => (
        <SuggestionRow key={a.id} account={a} world={world} onProfile={onProfile} />
      ))}

      <div className="section-title">Groesste Accounts</div>
      {top.map((a, i) => (
        <div className="rank-row" key={a.id}>
          <span className="rank-num">{i + 1}</span>
          <Avatar spec={a.avatar} size={28} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="small bold" style={{ cursor: 'pointer' }} onClick={() => onProfile(a.id)}>
              {a.handle} <Verified on={a.verified} />
            </div>
            <div className="small faint">{formatShort(followersOf(a))}</div>
          </div>
        </div>
      ))}

      {rising.length > 0 && (
        <>
          <div className="section-title">Wachsen gerade schnell</div>
          {rising.map((a) => (
            <div className="rank-row" key={a.id}>
              <Avatar spec={a.avatar} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small bold" style={{ cursor: 'pointer' }} onClick={() => onProfile(a.id)}>
                  {a.handle}
                </div>
                <div className="small up">+{formatShort(Math.round(a.momentum))} / Tag</div>
              </div>
            </div>
          ))}
        </>
      )}

      {world.log.length > 0 && (
        <>
          <div className="section-title">Deine Aktivitaet</div>
          {world.log.slice(0, 8).map((l) => (
            <div key={l.id} className="small muted" style={{ padding: '5px 0', borderBottom: '1px solid var(--surface-2)' }}>
              {l.text}
              <div className="faint" style={{ fontSize: 11 }}>{relTime(world, l.at)}</div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
