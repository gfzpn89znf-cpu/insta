import { useEffect, useState } from 'react';
import { addUserComment, replyToComment, toggleLike, toggleSave } from '../sim/actions';
import { NICHES } from '../sim/niches';
import { topicLabel } from '../sim/posts';
import { ensureComments } from '../sim/aiContent';
import { dispatch, touch } from '../sim/store';
import type { Post, World } from '../sim/types';
import { AccountAvatar, PostMedia } from './Media';
import { CaptionText, ScoreRow, Verified, engagementRate, formatFull, formatShort, relTime } from './common';

export default function PostDetail({
  post,
  world,
  onClose,
  onProfile,
}: {
  post: Post;
  world: World;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const author = world.accounts[post.authorId];
  const user = world.accounts[world.user.accountId];
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(post.byUser);
  const liked = world.user.likedPosts.includes(post.id);
  const saved = world.user.savedPosts.includes(post.id);

  // Kommentare von der echten KI schreiben lassen, falls eingerichtet.
  useEffect(() => {
    ensureComments(world, post, touch);
  }, [post.id, post.commentList.length]);

  if (!author) return null;

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (replyTo) dispatch((w) => replyToComment(w, post.id, replyTo, value));
    else dispatch((w) => addUserComment(w, post.id, value));
    setText('');
    setReplyTo(null);
  };

  const m = post.metrics;
  const explorePart = m.impressions > 0 ? m.reachExplore / m.impressions : 0;

  return (
    <div className="detail">
      <div className="detail-media">
        <PostMedia post={post} size={800} eager stockEnabled={world.settings.stockPhotos} />
      </div>

      <div className="detail-side">
        <div className="post-head detail-head">
          <button className="back-btn" onClick={onClose} aria-label="Zurueck">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="plain-btn row" onClick={() => onProfile(author.id)}>
            <AccountAvatar account={author} size={34} />
            <span style={{ marginLeft: 9, textAlign: 'left' }}>
              <span className="post-handle">
                {author.handle} <Verified on={author.verified} />
              </span>
              <span className="post-sub">
                {NICHES[post.niche].emoji} {topicLabel(post)}
              </span>
            </span>
          </button>
        </div>

        <div className="detail-comments">
          <div className="comment-line" style={{ marginBottom: 12 }}>
            <b>{author.handle}</b> <CaptionText text={post.caption} />
            <div style={{ marginTop: 4 }}>
              {post.hashtags.map((t) => (
                <span key={t} className="hashtag" style={{ marginRight: 5 }}>#{t}</span>
              ))}
            </div>
            <div className="post-time">{relTime(world, post.createdAt)}</div>
          </div>

          {post.commentList.length === 0 && <div className="empty small">Noch keine Kommentare.</div>}
          {post.commentList.map((c) => {
            const ca = world.accounts[c.authorId];
            return (
              <div key={c.id} style={{ marginBottom: 10 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  {ca && <AccountAvatar account={ca} size={26} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="comment-line">
                      <b style={{ cursor: 'pointer' }} onClick={() => ca && onProfile(ca.id)}>{ca?.handle ?? 'jemand'}</b> {c.text}
                    </div>
                    <div className="small faint">
                      {relTime(world, c.at)} · {formatShort(c.likes)} Likes
                      {post.byUser && !c.reply && (
                        <button className="btn ghost sm" onClick={() => setReplyTo(c.id)}>Antworten</button>
                      )}
                    </div>
                    {c.reply && (
                      <div className="comment-reply">
                        <b>{user.handle}</b> {c.reply}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="detail-foot">
          <div className="row" style={{ marginBottom: 6 }}>
            <button className={`icon-btn${liked ? ' liked' : ''}`} onClick={() => dispatch((w) => toggleLike(w, post.id))} aria-label="Gefaellt mir">
              {liked ? '♥' : '♡'}
            </button>
            <button className={`icon-btn${saved ? ' saved' : ''}`} onClick={() => dispatch((w) => toggleSave(w, post.id))} aria-label="Speichern">
              {saved ? '★' : '☆'}
            </button>
            <span className="spacer" />
            {post.byUser && (
              <button className="btn ghost sm" onClick={() => setShowInsights((v) => !v)}>
                {showInsights ? 'Statistik ausblenden' : 'Statistik anzeigen'}
              </button>
            )}
          </div>
          <div className="post-likes">{formatFull(m.likes)} „Gefaellt mir"-Angaben</div>

          {showInsights && post.byUser && (
            <div className="card" style={{ padding: 13, margin: '10px 0' }}>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="stat">
                  <div className="k">Reichweite</div>
                  <div className="v">{formatShort(m.impressions)}</div>
                  <div className="d faint">{Math.round(explorePart * 100)} % ueber Explore</div>
                </div>
                <div className="stat">
                  <div className="k">Interaktionsrate</div>
                  <div className="v">{(engagementRate(post) * 100).toFixed(1)} %</div>
                  <div className="d faint">Plattformschnitt 5,0 %</div>
                </div>
                <div className="stat">
                  <div className="k">Neue Follower</div>
                  <div className="v up">+{formatShort(m.newFollowers)}</div>
                  <div className="d faint">{formatShort(m.unfollows)} entfolgt</div>
                </div>
                <div className="stat">
                  <div className="k">Gespeichert</div>
                  <div className="v">{formatShort(m.saves)}</div>
                  <div className="d faint">{formatShort(m.shares)} geteilt</div>
                </div>
              </div>
              {post.breakdown && (
                <div style={{ marginTop: 14 }}>
                  <div className="section-title" style={{ margin: '0 0 8px' }}>Was diesen Beitrag getragen hat</div>
                  <ScoreRow name="Motiv" value={post.breakdown.motiv} />
                  <ScoreRow name="Text" value={post.breakdown.caption} />
                  <ScoreRow name="Hashtags" value={post.breakdown.hashtags} />
                  <ScoreRow name="Bild" value={post.breakdown.stil} />
                  <ScoreRow name="Zeitpunkt" value={post.breakdown.timing} />
                  <ScoreRow name="Regelmaessig" value={post.breakdown.konsistenz} />
                  <ScoreRow name="Nische" value={post.breakdown.nische} />
                </div>
              )}
            </div>
          )}

          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input"
              id="detail-comment"
              value={text}
              placeholder={replyTo ? 'Antwort schreiben...' : 'Kommentieren...'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button className="btn sm" disabled={!text.trim()} onClick={submit}>Senden</button>
          </div>
          {replyTo && (
            <div className="hint">
              Antwort auf einen Kommentar · <button className="btn ghost sm" onClick={() => setReplyTo(null)}>abbrechen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
