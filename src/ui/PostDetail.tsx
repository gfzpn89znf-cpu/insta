import { useState } from 'react';
import { addUserComment, replyToComment, toggleLike, toggleSave } from '../sim/actions';
import { NICHES } from '../sim/niches';
import { topicLabel } from '../sim/posts';
import { dispatch } from '../sim/store';
import type { Post, World } from '../sim/types';
import { Avatar, CaptionText, Modal, PostImage, ScoreRow, Verified, engagementRate, formatFull, formatShort, relTime } from './common';

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
  if (!author) return null;

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (replyTo) dispatch((w) => replyToComment(w, post.id, replyTo, t));
    else dispatch((w) => addUserComment(w, post.id, t));
    setText('');
    setReplyTo(null);
  };

  const m = post.metrics;
  const explorePart = m.impressions > 0 ? m.reachExplore / m.impressions : 0;

  return (
    <Modal onClose={onClose}>
      <div className="detail">
        <div className="detail-media">
          <PostImage seed={post.imageSeed} niche={post.niche} style={post.style} size={720} />
        </div>
        <div className="detail-side">
          <div className="post-head" style={{ borderBottom: '1px solid var(--border)' }}>
            <span onClick={() => onProfile(author.id)} style={{ cursor: 'pointer', display: 'flex' }}>
              <Avatar spec={author.avatar} size={34} />
            </span>
            <div className="who">
              <div className="post-handle">
                {author.handle} <Verified on={author.verified} />
              </div>
              <div className="post-sub">
                {NICHES[post.niche].emoji} {topicLabel(post)}
              </div>
            </div>
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="Schliessen">×</button>
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
                    {ca && <Avatar spec={ca.avatar} size={26} />}
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

          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <button className={`icon-btn${liked ? ' liked' : ''}`} onClick={() => dispatch((w) => toggleLike(w, post.id))}>
                {liked ? '♥' : '♡'}
              </button>
              <button className={`icon-btn${saved ? ' saved' : ''}`} onClick={() => dispatch((w) => toggleSave(w, post.id))}>
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
                    <ScoreRow name="Bildstil" value={post.breakdown.stil} />
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
                value={text}
                placeholder={replyTo ? 'Antwort schreiben...' : 'Kommentieren...'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
              <button className="btn sm" disabled={!text.trim()} onClick={submit}>
                Senden
              </button>
            </div>
            {replyTo && (
              <div className="hint">
                Antwort auf einen Kommentar · <button className="btn ghost sm" onClick={() => setReplyTo(null)}>abbrechen</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
