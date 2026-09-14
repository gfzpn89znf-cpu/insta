import { useMemo, useState } from 'react';
import { NICHES, NICHE_IDS, STYLE_LABELS } from '../sim/niches';
import { createUserPost } from '../sim/posts';
import { scoreDraft, type Draft } from '../sim/scoring';
import { dispatch } from '../sim/store';
import type { NicheId, StyleId, World } from '../sim/types';
import { Meter, PostImage, ScoreRow, formatShort } from './common';

const STYLE_IDS: StyleId[] = ['vivid', 'film', 'mono', 'golden', 'studio', 'neon', 'pastel', 'moody'];

export default function Composer({ world, onDone }: { world: World; onDone: (postId: string) => void }) {
  const user = world.accounts[world.user.accountId];
  const [niche, setNiche] = useState<NicheId>(user.niche);
  const [topicId, setTopicId] = useState(NICHES[user.niche].topics[0].id);
  const [style, setStyle] = useState<StyleId>(NICHES[user.niche].styles[0] as StyleId);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [collabId, setCollabId] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  const draft: Draft = { niche, topicId, style, caption, hashtags: tags, collabId: collabId || undefined, imageSeed: seed };
  const score = useMemo(() => scoreDraft(world, user, draft), [world.time, niche, topicId, style, caption, tags.join(','), collabId]);

  const trendTags = world.trends.map((t) => t.tag);
  const suggestedTags = [...new Set([...trendTags, ...NICHES[niche].hashtags])];
  const topics = NICHES[niche].topics;
  const following = user.following.map((id) => world.accounts[id]).filter(Boolean);

  const changeNiche = (n: NicheId) => {
    setNiche(n);
    setTopicId(NICHES[n].topics[0].id);
    setStyle(NICHES[n].styles[0] as StyleId);
    setSeed(Math.floor(Math.random() * 1e9));
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addCustom = () => {
    const clean = custom.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9äöüß_]/g, '');
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setCustom('');
  };

  const publish = () => {
    const post = dispatch((w) => createUserPost(w, draft));
    if (post) onDone(post.id);
  };

  const grade =
    score.total > 0.8 ? 'Top-Beitrag' : score.total > 0.62 ? 'Stark' : score.total > 0.45 ? 'Solide' : score.total > 0.3 ? 'Schwach' : 'Wird untergehen';

  return (
    <div className="modal-body">
      <div className="composer-grid">
        <div>
          <div className="preview-media">
            <PostImage seed={seed} niche={niche} style={style} size={520} />
          </div>
          <button className="btn secondary full sm" style={{ marginTop: 10 }} onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
            Anderes Motiv aufnehmen
          </button>

          <span className="label">Nische</span>
          <div className="chips">
            {NICHE_IDS.map((n) => (
              <button key={n} className={`chip${n === niche ? ' on' : ''}`} onClick={() => changeNiche(n)}>
                {NICHES[n].emoji} {NICHES[n].label}
              </button>
            ))}
          </div>
          {niche !== user.niche && (
            <div className="hint">
              Dein Publikum folgt dir wegen {NICHES[user.niche].label}. Themenwechsel kosten kurzfristig Reichweite.
            </div>
          )}

          <span className="label">Motiv</span>
          <div className="chips">
            {topics.map((t) => (
              <button key={t.id} className={`chip${t.id === topicId ? ' on' : ''}`} onClick={() => setTopicId(t.id)}>
                {t.label}
                {t.broad > 0.85 ? ' 🔥' : ''}
              </button>
            ))}
          </div>
          <div className="hint">🔥 = hohes Potenzial, auch Menschen ausserhalb deiner Nische zu erreichen.</div>

          <span className="label">Bildstil</span>
          <div className="chips">
            {STYLE_IDS.map((s) => (
              <button key={s} className={`chip${s === style ? ' on' : ''}`} onClick={() => setStyle(s)} title={STYLE_LABELS[s].hint}>
                {STYLE_LABELS[s].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Bildunterschrift</span>
          <textarea
            className="textarea"
            value={caption}
            maxLength={900}
            placeholder="Erzaehl etwas Persoenliches. Stell am Ende eine Frage - das bringt Kommentare."
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="hint">{caption.length} Zeichen · Ideal sind 40 bis 220.</div>

          <span className="label">Hashtags ({tags.length})</span>
          <div className="chips">
            {tags.map((t) => (
              <button key={t} className="chip on" onClick={() => toggleTag(t)}>
                #{t} ×
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input"
              value={custom}
              placeholder="Eigenen Hashtag hinzufuegen"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustom();
              }}
            />
            <button className="btn secondary sm" onClick={addCustom}>+</button>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {suggestedTags.slice(0, 18).map((t) => {
              const hot = trendTags.includes(t);
              return (
                <button key={t} className={`chip${hot ? ' hot' : ''}${tags.includes(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
                  #{t}{hot ? ' 🔥' : ''}
                </button>
              );
            })}
          </div>

          {following.length > 0 && (
            <>
              <span className="label">Kollaboration (optional)</span>
              <select className="select" value={collabId} onChange={(e) => setCollabId(e.target.value)}>
                <option value="">Niemanden markieren</option>
                {following.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.handle} · {formatShort(a.realFollowers.length + a.crowdFollowers)} Follower
                  </option>
                ))}
              </select>
            </>
          )}

          <span className="label">Vorab-Analyse</span>
          <div className="card" style={{ padding: 14 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 17 }}>{Math.round(score.total * 100)}</b>
              <span className="muted small">/ 100 · {grade}</span>
              <span className="spacer" />
            </div>
            <Meter value={score.total} />
            <div style={{ marginTop: 14 }}>
              <ScoreRow name="Motiv" value={score.motiv} />
              <ScoreRow name="Text" value={score.caption} />
              <ScoreRow name="Hashtags" value={score.hashtags} />
              <ScoreRow name="Bildstil" value={score.stil} />
              <ScoreRow name="Zeitpunkt" value={score.timing} />
              <ScoreRow name="Regelmaessig" value={score.konsistenz} />
              <ScoreRow name="Nische" value={score.nische} />
              {score.kollab > 0 && <ScoreRow name="Kollab" value={score.kollab} />}
            </div>
          </div>

          {score.hints.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {score.hints.map((h, i) => (
                <div className="tip" key={i}>
                  <span>💡</span>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn grad full" style={{ marginTop: 14 }} onClick={publish}>
            Jetzt veroeffentlichen
          </button>
          <div className="hint center-text">
            Der Algorithmus testet deinen Beitrag zuerst an einer kleinen Gruppe. Was dort gut ankommt, wird weiterverteilt.
          </div>
        </div>
      </div>
    </div>
  );
}
