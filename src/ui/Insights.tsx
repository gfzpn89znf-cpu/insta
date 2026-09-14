import { useMemo } from 'react';
import { NICHES, getTopic } from '../sim/niches';
import type { Post, World } from '../sim/types';
import { LineChart, engagementRate, followersOf, formatFull, formatShort, relTime } from './common';

export default function Insights({ world, onOpen }: { world: World; onOpen: (id: string) => void }) {
  const user = world.accounts[world.user.accountId];
  const posts = useMemo(
    () => user.postIds.map((id) => world.posts[id]).filter(Boolean).reverse(),
    [user.postIds.length, world.time],
  );

  const followers = followersOf(user);
  const weekAgo = world.time - 7 * 1440;
  const past = user.history.find((h) => h.t >= weekAgo)?.followers ?? user.history[0]?.followers ?? followers;
  const weekGrowth = followers - past;

  const recent = posts.filter((p) => p.createdAt >= weekAgo);
  const reach7 = recent.reduce((s, p) => s + p.metrics.impressions, 0);
  const avgEr = posts.length ? posts.reduce((s, p) => s + engagementRate(p), 0) / posts.length : 0;
  const avgNew = posts.length ? posts.reduce((s, p) => s + p.metrics.newFollowers, 0) / posts.length : 0;

  // Welche Motive bringen tatsaechlich Follower?
  const byTopic = useMemo(() => {
    const map = new Map<string, { label: string; posts: number; followers: number; reach: number }>();
    for (const p of posts) {
      const t = getTopic(p.niche, p.topic);
      const key = `${p.niche}:${p.topic}`;
      const entry = map.get(key) ?? { label: `${NICHES[p.niche].emoji} ${t.label}`, posts: 0, followers: 0, reach: 0 };
      entry.posts += 1;
      entry.followers += p.metrics.newFollowers;
      entry.reach += p.metrics.impressions;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.followers / b.posts - a.followers / a.posts).slice(0, 6);
  }, [posts.length, world.time]);

  // Zu welcher Uhrzeit lief es am besten?
  const byHour = useMemo(() => {
    const buckets = new Array(24).fill(0).map(() => ({ reach: 0, n: 0 }));
    for (const p of posts) {
      const h = Math.floor((p.createdAt / 60) % 24);
      buckets[h].reach += p.metrics.impressions;
      buckets[h].n += 1;
    }
    return buckets
      .map((b, h) => ({ hour: h, avg: b.n ? b.reach / b.n : 0, n: b.n }))
      .filter((b) => b.n > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);
  }, [posts.length, world.time]);

  const best = posts.slice().sort((a, b) => b.metrics.impressions - a.metrics.impressions)[0];

  return (
    <div style={{ paddingTop: 18 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 14px' }}>Statistiken</h2>

      <div className="stat-grid">
        <div className="stat">
          <div className="k">Follower</div>
          <div className="v">{formatFull(followers)}</div>
          <div className={`d ${weekGrowth >= 0 ? 'up' : 'down'}`}>
            {weekGrowth >= 0 ? '+' : ''}{formatShort(weekGrowth)} in 7 Tagen
          </div>
        </div>
        <div className="stat">
          <div className="k">Reichweite (7 Tage)</div>
          <div className="v">{formatShort(reach7)}</div>
          <div className="d faint">{recent.length} Beitraege</div>
        </div>
        <div className="stat">
          <div className="k">Interaktionsrate</div>
          <div className="v">{(avgEr * 100).toFixed(1)} %</div>
          <div className={`d ${avgEr > 0.05 ? 'up' : 'down'}`}>Schnitt der Plattform: 5,0 %</div>
        </div>
        <div className="stat">
          <div className="k">Follower je Beitrag</div>
          <div className="v">{formatShort(avgNew)}</div>
          <div className="d faint">Serie: {user.streak} Tage</div>
        </div>
        <div className="stat">
          <div className="k">Einnahmen</div>
          <div className="v">{formatFull(world.user.money)} €</div>
          <div className="d faint">{world.user.deals.length} Kooperationen</div>
        </div>
        <div className="stat">
          <div className="k">Ruf bei Marken</div>
          <div className="v">{Math.round(world.user.reputation * 100)}</div>
          <div className="d faint">beeinflusst die Honorare</div>
        </div>
      </div>

      <div className="section-title">Followerentwicklung</div>
      <div className="card" style={{ padding: 14 }}>
        <LineChart points={user.history.map((h) => ({ x: h.t, y: h.followers }))} />
      </div>

      {best && (
        <>
          <div className="section-title">Dein bester Beitrag</div>
          <div className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => onOpen(best.id)}>
            <div className="row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{getTopic(best.niche, best.topic).label}</b>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {best.caption}
                </div>
                <div className="small faint">{relTime(world, best.createdAt)}</div>
              </div>
              <div className="center-text">
                <b style={{ fontSize: 18 }}>{formatShort(best.metrics.impressions)}</b>
                <div className="small faint">Reichweite</div>
              </div>
              <div className="center-text">
                <b style={{ fontSize: 18 }} className="up">+{formatShort(best.metrics.newFollowers)}</b>
                <div className="small faint">Follower</div>
              </div>
            </div>
          </div>
        </>
      )}

      {byTopic.length > 0 && (
        <>
          <div className="section-title">Was bei deinem Publikum funktioniert</div>
          <div className="card" style={{ padding: 14 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Motiv</th>
                  <th>Beitraege</th>
                  <th>Ø Reichweite</th>
                  <th>Ø neue Follower</th>
                </tr>
              </thead>
              <tbody>
                {byTopic.map((t) => (
                  <tr key={t.label}>
                    <td>{t.label}</td>
                    <td>{t.posts}</td>
                    <td>{formatShort(t.reach / t.posts)}</td>
                    <td className="up">+{formatShort(t.followers / t.posts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {byHour.length > 0 && (
        <>
          <div className="section-title">Deine besten Uhrzeiten</div>
          <div className="chips">
            {byHour.map((b) => (
              <span key={b.hour} className="pill good">
                {String(b.hour).padStart(2, '0')}:00 Uhr · Ø {formatShort(b.avg)}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Alle Beitraege</div>
      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        {posts.length === 0 ? (
          <div className="empty small">Noch keine Beitraege veroeffentlicht.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Motiv</th>
                <th>Qualitaet</th>
                <th>Reichweite</th>
                <th>Explore</th>
                <th>Likes</th>
                <th>Rate</th>
                <th>Follower</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.slice(0, 40).map((p: Post) => (
                <tr key={p.id}>
                  <td>{getTopic(p.niche, p.topic).label}</td>
                  <td>{Math.round((p.breakdown?.total ?? p.quality) * 100)}</td>
                  <td>{formatShort(p.metrics.impressions)}</td>
                  <td>{Math.round((p.metrics.reachExplore / Math.max(1, p.metrics.impressions)) * 100)} %</td>
                  <td>{formatShort(p.metrics.likes)}</td>
                  <td className={engagementRate(p) > 0.05 ? 'up' : 'down'}>{(engagementRate(p) * 100).toFixed(1)} %</td>
                  <td className="up">+{formatShort(p.metrics.newFollowers)}</td>
                  <td>
                    <button className="btn ghost sm" onClick={() => onOpen(p.id)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
