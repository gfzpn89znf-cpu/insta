import { useMemo, useState } from 'react';
import { buildExplore, leaderboard, searchAccounts } from '../sim/feed';
import { NICHES, NICHE_IDS } from '../sim/niches';
import type { NicheId, World } from '../sim/types';
import { GridTile } from './PostCard';
import { SuggestionRow } from './Feed';
import { Avatar, Verified, followersOf, formatShort } from './common';

export default function Explore({
  world,
  onProfile,
  onOpen,
  onTag,
}: {
  world: World;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [niche, setNiche] = useState<NicheId | null>(null);

  const accountHits = useMemo(() => (query ? searchAccounts(world, query, 12) : []), [query, world.time]);
  const grid = useMemo(() => buildExplore(world, 36, niche ?? undefined), [world.time, niche]);
  const board = useMemo(() => leaderboard(world, 20), [world.time]);

  return (
    <div style={{ paddingTop: 18 }}>
      <input
        className="input"
        placeholder="Nach Accounts oder #Hashtags suchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.startsWith('#')) onTag(query.slice(1));
        }}
      />

      {query && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          {query.startsWith('#') ? (
            <button className="btn secondary full" onClick={() => onTag(query.slice(1))}>
              Beitraege zu {query} ansehen
            </button>
          ) : accountHits.length === 0 ? (
            <div className="empty small">Keine Treffer.</div>
          ) : (
            accountHits.map((a) => <SuggestionRow key={a.id} account={a} world={world} onProfile={onProfile} />)
          )}
        </div>
      )}

      <div className="section-title">Themen</div>
      <div className="chips">
        <button className={`chip${niche === null ? ' on' : ''}`} onClick={() => setNiche(null)}>Alles</button>
        {NICHE_IDS.map((n) => (
          <button key={n} className={`chip${niche === n ? ' on' : ''}`} onClick={() => setNiche(n)}>
            {NICHES[n].emoji} {NICHES[n].label}
          </button>
        ))}
      </div>

      {world.trends.length > 0 && (
        <>
          <div className="section-title">Trend-Hashtags</div>
          <div className="chips">
            {world.trends.map((t) => (
              <button key={t.tag} className="chip hot" onClick={() => onTag(t.tag)}>
                #{t.tag} · {formatShort(t.posts)} Beitraege
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Entdecken</div>
      <div className="grid">
        {grid.map((p) => (
          <GridTile key={p.id} post={p} onOpen={onOpen} stockEnabled={world.settings.stockPhotos} />
        ))}
      </div>

      <div className="section-title">Rangliste der Szene</div>
      <div className="card" style={{ padding: 12 }}>
        {board.map((a, i) => (
          <div className="rank-row" key={a.id}>
            <span className="rank-num">{i + 1}</span>
            <Avatar spec={a.avatar} size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="post-handle" style={{ cursor: 'pointer' }} onClick={() => onProfile(a.id)}>
                {a.handle} <Verified on={a.verified} />
                {a.isUser && <span className="pill good">Du</span>}
              </div>
              <div className="post-sub">
                {NICHES[a.niche].emoji} {NICHES[a.niche].label} · {formatShort(followersOf(a))} Follower
              </div>
            </div>
            {a.momentum > 0 && <span className="small up">+{formatShort(Math.round(a.momentum))}/Tag</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
