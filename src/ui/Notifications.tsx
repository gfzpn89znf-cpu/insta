import { useEffect } from 'react';
import { markNotificationsRead } from '../sim/actions';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { Avatar, Verified, relTime } from './common';

const ICONS: Record<string, string> = {
  like: '♥',
  comment: '☐',
  follow: '👤',
  mention: '@',
  milestone: '🏆',
  viral: '🚀',
  system: '🔔',
  story: '⭘',
};

export default function Notifications({
  world,
  onProfile,
  onOpen,
}: {
  world: World;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  useEffect(() => {
    // Beim Oeffnen gelten alle Meldungen als gesehen.
    const timer = window.setTimeout(() => dispatch((w) => markNotificationsRead(w)), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (world.notifications.length === 0) {
    return (
      <div className="empty">
        <p>Noch keine Aktivitaeten.</p>
        <p className="small">Sobald jemand deine Beitraege sieht, erscheint es hier.</p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 18 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Aktivitaeten</h2>
      {world.notifications.map((n) => {
        const actor = n.actorId ? world.accounts[n.actorId] : undefined;
        const post = n.postId ? world.posts[n.postId] : undefined;
        return (
          <div className={`notif${n.read ? '' : ' unread'}`} key={n.id}>
            {actor ? (
              <span onClick={() => onProfile(actor.id)} style={{ cursor: 'pointer', display: 'flex' }}>
                <Avatar spec={actor.avatar} size={40} />
              </span>
            ) : (
              <span style={{ fontSize: 24, width: 40, textAlign: 'center' }}>{ICONS[n.kind] ?? '🔔'}</span>
            )}
            <div className="notif-text">
              {actor && (
                <b style={{ cursor: 'pointer' }} onClick={() => onProfile(actor.id)}>
                  {actor.handle} <Verified on={actor.verified} />{' '}
                </b>
              )}
              {n.text}
              <div className="small faint">{relTime(world, n.at)}</div>
            </div>
            {post && (
              <button className="btn ghost sm" onClick={() => onOpen(post.id)}>
                Ansehen
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
