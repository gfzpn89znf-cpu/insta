import { useState } from 'react';
import { addUserComment, toggleFollow, toggleLike, toggleSave } from '../sim/actions';
import { dispatch } from '../sim/store';
import { NICHES, getTopic } from '../sim/niches';
import { topicLabel } from '../sim/posts';
import type { Post, World } from '../sim/types';
import { AccountAvatar, CaptionText, PostMedia, Verified, followersOf, formatFull, formatShort, relTime } from './common';

interface Props {
  post: Post;
  world: World;
  onProfile: (id: string) => void;
  onOpen: (id: string) => void;
  onTag?: (tag: string) => void;
}

export default function PostCard({ post, world, onProfile, onOpen, onTag }: Props) {
  const author = world.accounts[post.authorId];
  const user = world.accounts[world.user.accountId];
  const [comment, setComment] = useState('');
  const liked = world.user.likedPosts.includes(post.id);
  const saved = world.user.savedPosts.includes(post.id);
  const follows = user.following.includes(post.authorId);
  if (!author) return null;

  const namedLiker = post.likedBy.map((id) => world.accounts[id]).find((a) => a && !a.isUser);
  const visibleComments = post.commentList.slice(-2);

  const submit = () => {
    const text = comment.trim();
    if (!text) return;
    dispatch((w) => addUserComment(w, post.id, text));
    setComment('');
  };

  return (
    <article className="card post">
      <header className="post-head">
        <span onClick={() => onProfile(author.id)} style={{ cursor: 'pointer', display: 'flex' }}>
          <AccountAvatar account={author} size={36} />
        </span>
        <div className="who">
          <div className="post-handle" onClick={() => onProfile(author.id)} style={{ cursor: 'pointer' }}>
            {author.handle} <Verified on={author.verified} />
          </div>
          <div className="post-sub">
            {NICHES[post.niche].emoji} {topicLabel(post)} · {relTime(world, post.createdAt)}
          </div>
        </div>
        <span className="spacer" />
        {!author.isUser && !follows && (
          <button className="btn ghost sm" onClick={() => dispatch((w) => toggleFollow(w, author.id))}>
            Folgen
          </button>
        )}
      </header>

      <div className="post-media" onDoubleClick={() => dispatch((w) => toggleLike(w, post.id))}>
        <PostMedia post={post} size={640} stockEnabled={world.settings.stockPhotos} />
      </div>

      <div className="post-actions">
        <button
          className={`icon-btn${liked ? ' liked' : ''}`}
          onClick={() => dispatch((w) => toggleLike(w, post.id))}
          aria-label="Gefaellt mir"
          title="Gefaellt mir"
        >
          {liked ? '♥' : '♡'}
        </button>
        <button className="icon-btn" onClick={() => onOpen(post.id)} aria-label="Kommentieren" title="Kommentieren">
          ☐
        </button>
        <span className="small faint">{formatShort(post.metrics.shares)} geteilt</span>
        <span className="spacer" />
        <button
          className={`icon-btn${saved ? ' saved' : ''}`}
          onClick={() => dispatch((w) => toggleSave(w, post.id))}
          aria-label="Speichern"
          title="Speichern"
        >
          {saved ? '★' : '☆'}
        </button>
      </div>

      <div className="post-body">
        <div className="post-likes">
          {namedLiker && post.metrics.likes > 1 ? (
            <>
              Gefaellt <b onClick={() => onProfile(namedLiker.id)} style={{ cursor: 'pointer' }}>{namedLiker.handle}</b> und{' '}
              {formatShort(Math.max(0, post.metrics.likes - 1))} weiteren
            </>
          ) : (
            <>{formatFull(post.metrics.likes)} „Gefaellt mir"-Angaben</>
          )}
        </div>
        <div className="post-caption">
          <b onClick={() => onProfile(author.id)} style={{ cursor: 'pointer' }}>{author.handle}</b>{' '}
          <CaptionText text={post.caption} onTag={onTag} />
          {post.hashtags.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {post.hashtags.map((t) => (
                <span key={t} className="hashtag" style={{ cursor: 'pointer', marginRight: 5 }} onClick={() => onTag?.(t)}>
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {post.metrics.comments > 2 && (
          <div className="small faint" style={{ marginTop: 6, cursor: 'pointer' }} onClick={() => onOpen(post.id)}>
            Alle {formatShort(post.metrics.comments)} Kommentare ansehen
          </div>
        )}
        {visibleComments.map((c) => {
          const ca = world.accounts[c.authorId];
          return (
            <div key={c.id} className="comment-line">
              <b style={{ cursor: 'pointer' }} onClick={() => ca && onProfile(ca.id)}>{ca?.handle ?? 'jemand'}</b> {c.text}
            </div>
          );
        })}

        {post.byUser && post.breakdown && (
          <div className="small faint" style={{ marginTop: 8 }}>
            Reichweite {formatShort(post.metrics.impressions)} · {Math.round(post.breakdown.total * 100)} Punkte Beitragsqualitaet ·{' '}
            {getTopic(post.niche, post.topic).label}
          </div>
        )}

        <div className="post-time">{relTime(world, post.createdAt)}</div>
      </div>

      <div className="comment-box">
        <AccountAvatar account={user} size={26} />
        <input
          value={comment}
          placeholder="Kommentieren..."
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button className="btn ghost sm" disabled={!comment.trim()} onClick={submit}>
          Posten
        </button>
      </div>
    </article>
  );
}

/** Kompakte Vorschau fuer Raster-Ansichten. */
export function GridTile({
  post,
  onOpen,
  size = 240,
  stockEnabled = true,
}: {
  post: Post;
  onOpen: (id: string) => void;
  size?: number;
  stockEnabled?: boolean;
}) {
  return (
    <button className="grid-item" onClick={() => onOpen(post.id)}>
      <PostMedia post={post} size={size} stockEnabled={stockEnabled} />
      <span className="grid-overlay">
        <span>♥ {formatShort(post.metrics.likes)}</span>
        <span>☐ {formatShort(post.metrics.comments)}</span>
      </span>
    </button>
  );
}

export function followerLabel(count: number): string {
  return `${formatShort(count)} Follower`;
}

export { followersOf };
