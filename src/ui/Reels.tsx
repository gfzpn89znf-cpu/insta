import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleLike, toggleSave } from '../sim/actions';
import { buildReels } from '../sim/feed';
import { NICHES } from '../sim/niches';
import { topicLabel } from '../sim/posts';
import { dispatch } from '../sim/store';
import type { Post, World } from '../sim/types';
import { AccountAvatar, ReelMedia } from './Media';
import { CaptionText, Verified, formatShort, relTime } from './common';

/**
 * Reels: ein Video pro Bildschirm, senkrecht durchscrollen. Nur das gerade
 * sichtbare Video laeuft - alles andere pausiert, damit Akku und Datenmenge
 * nicht leiden.
 */
export default function Reels({
  world,
  onProfile,
  onOpen,
  onTag,
  onCreate,
}: {
  world: World;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
  onCreate: () => void;
}) {
  const reels = useMemo(() => buildReels(world, 30), [world.time]);
  const [activeId, setActiveId] = useState<string | undefined>(reels[0]?.id);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Welches Reel ist gerade im Bild?
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveId((entry.target as HTMLElement).dataset.postId);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [reels.map((r) => r.id).join(',')]);

  if (reels.length === 0) {
    return (
      <div className="empty">
        <p>Noch keine Reels da.</p>
        <button className="btn grad" onClick={onCreate}>Eigenes Reel hochladen</button>
      </div>
    );
  }

  return (
    <div className="reels" ref={containerRef}>
      {reels.map((post) => (
        <ReelItem
          key={post.id}
          post={post}
          world={world}
          active={post.id === activeId}
          muted={muted}
          onToggleSound={() => setMuted((m) => !m)}
          onProfile={onProfile}
          onOpen={onOpen}
          onTag={onTag}
        />
      ))}
    </div>
  );
}

function ReelItem({
  post,
  world,
  active,
  muted,
  onToggleSound,
  onProfile,
  onOpen,
  onTag,
}: {
  post: Post;
  world: World;
  active: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
}) {
  const author = world.accounts[post.authorId];
  const liked = world.user.likedPosts.includes(post.id);
  const saved = world.user.savedPosts.includes(post.id);
  if (!author) return null;

  return (
    <section className="reel" data-post-id={post.id}>
      <ReelMedia post={post} active={active} muted={muted} stockEnabled={world.settings.stockPhotos} />

      <div className="reel-shade" />

      <div className="reel-side">
        <button
          className={`reel-action${liked ? ' liked' : ''}`}
          onClick={() => dispatch((w) => toggleLike(w, post.id))}
          aria-label="Gefaellt mir"
        >
          <span>{liked ? '♥' : '♡'}</span>
          <small>{formatShort(post.metrics.likes)}</small>
        </button>
        <button className="reel-action" onClick={() => onOpen(post.id)} aria-label="Kommentare">
          <span>☐</span>
          <small>{formatShort(post.metrics.comments)}</small>
        </button>
        <button
          className={`reel-action${saved ? ' saved' : ''}`}
          onClick={() => dispatch((w) => toggleSave(w, post.id))}
          aria-label="Speichern"
        >
          <span>{saved ? '★' : '☆'}</span>
          <small>{formatShort(post.metrics.saves)}</small>
        </button>
        <button className="reel-action" onClick={onToggleSound} aria-label={muted ? 'Ton an' : 'Ton aus'}>
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      <div className="reel-info">
        <button className="plain-btn row" onClick={() => onProfile(author.id)}>
          <AccountAvatar account={author} size={34} />
          <span style={{ marginLeft: 9 }}>
            <span className="post-handle">
              {author.handle} <Verified on={author.verified} />
            </span>
          </span>
        </button>
        <div className="reel-caption">
          <CaptionText text={post.caption} onTag={onTag} />
        </div>
        <div className="reel-meta">
          {NICHES[post.niche].emoji} {topicLabel(post)} · {relTime(world, post.createdAt)}
          {post.videoId ? ' · dein Video' : ''}
        </div>
      </div>
    </section>
  );
}
