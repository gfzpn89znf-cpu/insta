import { useMemo, useRef, useState } from 'react';
import { NICHES, NICHE_IDS, STYLE_LABELS } from '../sim/niches';
import { aiReady } from '../sim/ai';
import { importPhoto, importVideo } from '../sim/photos';
import { getPrivacy } from '../sim/flags';
import { downloadPicture, searchPictures, type PictureHit } from '../sim/imageSearch';
import { describeUpload, type MediaInsight } from '../sim/vision';
import { createUserPost } from '../sim/posts';
import { scoreDraft, type Draft } from '../sim/scoring';
import { dispatch } from '../sim/store';
import type { NicheId, PostFormat, StyleId, World } from '../sim/types';
import { usePhotoUrl } from './Media';
import { Meter, PostMedia, ScoreRow, formatShort } from './common';

const STYLE_IDS: StyleId[] = ['vivid', 'film', 'mono', 'golden', 'studio', 'neon', 'pastel', 'moody'];

export default function Composer({
  world,
  onDone,
  onClose,
}: {
  world: World;
  onDone: (postId: string) => void;
  onClose: () => void;
}) {
  const user = world.accounts[world.user.accountId];
  const [niche, setNiche] = useState<NicheId>(user.niche);
  const [topicId, setTopicId] = useState(NICHES[user.niche].topics[0].id);
  const [style, setStyle] = useState<StyleId>(NICHES[user.niche].styles[0] as StyleId);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [collabId, setCollabId] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [videoId, setVideoId] = useState<string | undefined>();
  const [format, setFormat] = useState<PostFormat>('photo');
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [insight, setInsight] = useState<MediaInsight | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [searching, setSearching] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const photo = usePhotoUrl(photoId);
  const video = usePhotoUrl(videoId);

  const draft: Draft = {
    niche,
    topicId,
    style,
    caption,
    hashtags: tags,
    collabId: collabId || undefined,
    imageSeed: seed,
    photoId,
    format,
    videoId,
    mediaTitle: insight?.description,
  };
  const score = useMemo(
    () => scoreDraft(world, user, draft),
    [world.time, niche, topicId, style, caption, tags.join(','), collabId, photoId, videoId, format],
  );

  /** Schaut sich die Aufnahme an und erkennt, worum es geht. */
  const analyse = async (file: File) => {
    // Ohne Erlaubnis verlaesst kein Bild das Geraet.
    if (!getPrivacy().shareImages || !aiReady()) return;
    setAnalysing(true);
    const result = await describeUpload(file);
    setAnalysing(false);
    if (!result) return;
    setInsight(result);
    // Passendes Thema gleich uebernehmen, den Rest schlaegt die App nur vor.
    if (result.niche && result.niche !== niche) changeNiche(result.niche);
  };

  const trendTags = world.trends.map((t) => t.tag);
  const suggestedTags = [...new Set([...NICHES[niche].hashtags, ...trendTags])];
  const topics = NICHES[niche].topics;
  const following = user.following.map((id) => world.accounts[id]).filter(Boolean);

  const changeNiche = (n: NicheId) => {
    setNiche(n);
    setTopicId(NICHES[n].topics[0].id);
    setStyle(NICHES[n].styles[0] as StyleId);
    if (!photoId) setSeed(Math.floor(Math.random() * 1e9));
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addCustom = () => {
    const clean = custom.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9äöüß_]/g, '');
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setCustom('');
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setLoadingPhoto(true);
    setMediaError('');
    setInsight(null);
    const id = await importPhoto(file);
    setLoadingPhoto(false);
    if (id) {
      setPhotoId(id);
      setVideoId(undefined);
      void analyse(file);
    } else {
      setMediaError('Das Foto konnte nicht gelesen werden.');
    }
  };

  const pickVideo = async (file: File | undefined) => {
    if (!file) return;
    setLoadingPhoto(true);
    setMediaError('');
    const result = await importVideo(file);
    setLoadingPhoto(false);
    if ('id' in result) {
      setVideoId(result.id);
      setPhotoId(undefined);
      setFormat('reel');
      setInsight(null);
      void analyse(file);
    } else {
      setMediaError(result.error);
    }
  };

  /** Ein gefundenes Bild herunterladen und wie ein eigenes Foto ablegen. */
  const takePicture = async (hit: PictureHit) => {
    setSearching(true);
    setMediaError('');
    const file = await downloadPicture(hit);
    if (!file) {
      setSearching(false);
      setMediaError('Das Bild liess sich nicht laden. Versuch ein anderes aus der Liste.');
      return;
    }
    const id = await importPhoto(file);
    setSearching(false);
    if (!id) {
      setMediaError('Das Bild konnte nicht verarbeitet werden.');
      return;
    }
    setPhotoId(id);
    setVideoId(undefined);
    setFormat('photo');
    setInsight(null);
    void analyse(file);
  };

  const publish = () => {
    const post = dispatch((w) => createUserPost(w, draft));
    if (post) onDone(post.id);
  };

  const grade =
    score.total > 0.8 ? 'Top-Beitrag' : score.total > 0.62 ? 'Stark' : score.total > 0.45 ? 'Solide' : score.total > 0.3 ? 'Schwach' : 'Wird untergehen';

  return (
    <div className="composer">
      <header className="screen-head">
        <button className="back-btn" onClick={onClose} aria-label="Abbrechen">×</button>
        <div className="screen-title">
          <div className="screen-title-main">Neuer Beitrag</div>
        </div>
        <button className="btn sm grad" onClick={publish}>Teilen</button>
      </header>

      <div className="composer-grid">
        <div>
          <div className="chips" style={{ marginBottom: 10 }}>
            <button className={`chip${format === 'photo' ? ' on' : ''}`} onClick={() => setFormat('photo')}>
              🖼 Beitrag
            </button>
            <button className={`chip${format === 'reel' ? ' on' : ''}`} onClick={() => setFormat('reel')}>
              ▶ Reel
            </button>
          </div>

          <div className={`preview-media${format === 'reel' ? ' tall' : ''}`}>
            {videoId && video ? (
              <video className="media-img" src={video} muted loop autoPlay playsInline />
            ) : photoId ? (
              photo ? (
                <img className="media-img" src={photo} alt="Dein Foto" />
              ) : (
                <div className="media-placeholder" />
              )
            ) : (
              <PostMedia
                post={{ ...emptyPreview, imageSeed: seed, niche, style }}
                size={560}
                eager
                stockEnabled={false}
              />
            )}
          </div>

          <div className="photo-actions">
            <button className="btn secondary sm" disabled={loadingPhoto} onClick={() => galleryRef.current?.click()}>
              {loadingPhoto ? 'Foto wird geladen...' : '🖼 Foto waehlen'}
            </button>
            <button className="btn secondary sm" disabled={loadingPhoto} onClick={() => cameraRef.current?.click()}>
              📷 Kamera
            </button>
            <button className="btn secondary sm" disabled={loadingPhoto} onClick={() => videoRef.current?.click()}>
              🎬 Video
            </button>
            {videoId ? (
              <button className="btn ghost sm" onClick={() => setVideoId(undefined)}>Video entfernen</button>
            ) : photoId ? (
              <button className="btn ghost sm" onClick={() => setPhotoId(undefined)}>Foto entfernen</button>
            ) : (
              <button className="btn ghost sm" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
                Anderes Motiv
              </button>
            )}
          </div>
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              void pickVideo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <PictureSearch busy={searching || loadingPhoto} onPick={(hit) => void takePicture(hit)} />

          {mediaError && <div className="tip warn"><span>⚠️</span><span>{mediaError}</span></div>}

          {analysing && (
            <div className="tip">
              <span>👁</span>
              <span>Die KI schaut sich deine Aufnahme an...</span>
            </div>
          )}

          {(photoId || videoId) && aiReady() && !getPrivacy().shareImages && (
            <div className="tip">
              <span>🔒</span>
              <span>
                Deine Aufnahme bleibt auf dem Geraet. Wenn die KI erkennen soll, was darauf zu sehen ist, erlaube das in
                den Einstellungen unter „Sicherheit und Privatsphaere".
              </span>
            </div>
          )}

          {insight && (
            <div className="card insight" style={{ padding: 12, marginTop: 10 }}>
              <div className="small bold">Erkannt</div>
              <div className="small muted">{insight.description}</div>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
                {insight.hashtags.length > 0 && (
                  <button
                    className="btn secondary sm"
                    onClick={() => setTags([...new Set([...tags, ...insight.hashtags])].slice(0, 12))}
                  >
                    Hashtags uebernehmen
                  </button>
                )}
                {insight.caption && (
                  <button className="btn secondary sm" onClick={() => setCaption(insight.caption!)}>
                    Unterschrift vorschlagen
                  </button>
                )}
              </div>
              {insight.hashtags.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {insight.hashtags.map((t) => (
                    <button key={t} className={`chip${tags.includes(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {format === 'reel' && !videoId && (
            <div className="hint">
              Ohne eigenes Video wird dein Motiv als bewegter Clip gezeigt. Mit „🎬 Video" laedst du eine echte Aufnahme hoch.
            </div>
          )}

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

          {!photoId && (
            <>
              <span className="label">Bildstil</span>
              <div className="chips">
                {STYLE_IDS.map((s) => (
                  <button key={s} className={`chip${s === style ? ' on' : ''}`} onClick={() => setStyle(s)} title={STYLE_LABELS[s].hint}>
                    {STYLE_LABELS[s].label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <span className="label">Bildunterschrift</span>
          <textarea
            className="textarea"
            id="composer-caption"
            value={caption}
            maxLength={900}
            placeholder="Erzaehl etwas Persoenliches. Stell am Ende eine Frage - das bringt Kommentare."
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="hint">{caption.length} Zeichen · Ideal sind 40 bis 220.</div>

          <span className="label">Hashtags ({tags.length})</span>
          {tags.length > 0 && (
            <div className="chips">
              {tags.map((t) => (
                <button key={t} className="chip on" onClick={() => toggleTag(t)}>
                  #{t} ×
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input"
              id="composer-tag"
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
              <select className="select" id="composer-collab" value={collabId} onChange={(e) => setCollabId(e.target.value)}>
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
            </div>
            <Meter value={score.total} />
            <div style={{ marginTop: 14 }}>
              <ScoreRow name="Motiv" value={score.motiv} />
              <ScoreRow name="Text" value={score.caption} />
              <ScoreRow name="Hashtags" value={score.hashtags} />
              <ScoreRow name="Bild" value={score.stil} />
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
            Der Algorithmus testet deinen Beitrag zuerst an einer kleinen Gruppe. Was dort gut ankommt, wird
            weiterverteilt.
          </div>
        </div>
      </div>
    </div>
  );
}

/** Geruest fuer die Vorschau des gezeichneten Motivs. */
const emptyPreview = {
  id: 'preview',
  authorId: 'u0',
  createdAt: 0,
  topic: '',
  caption: '',
  hashtags: [],
  photoSource: 'generated' as const,
  format: 'photo' as const,
  quality: 0.5,
  algoScore: 1,
  metrics: {
    impressions: 0,
    reachFollowers: 0,
    reachExplore: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
    newFollowers: 0,
    unfollows: 0,
  },
  likedBy: [],
  commentList: [],
  energy: 1,
  luck: 1,
  seedNum: 1,
  lastTick: 0,
  byUser: true,
  imageSeed: 1,
  niche: 'fitness' as NicheId,
  style: 'vivid' as StyleId,
};

/**
 * Eigene Bildersuche: Suchbegriff eingeben, aus den Treffern eines
 * auswaehlen. Das gewaehlte Bild wird heruntergeladen und liegt danach
 * genauso auf dem Geraet wie ein selbst aufgenommenes Foto.
 */
function PictureSearch({ busy, onPick }: { busy: boolean; onPick: (hit: PictureHit) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState<PictureHit[] | null>(null);
  const [used, setUsed] = useState('');
  const [error, setError] = useState('');
  const offline = getPrivacy().offline;

  const run = async () => {
    if (!term.trim() || running) return;
    setRunning(true);
    setError('');
    setHits(null);
    const outcome = await searchPictures(term);
    setRunning(false);
    setHits(outcome.hits);
    setUsed(outcome.usedQuery);
    setError(outcome.error ?? '');
  };

  if (!open) {
    return (
      <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        🔎 Bild im Netz suchen
      </button>
    );
  }

  return (
    <div className="card picture-search">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b className="small">Bild suchen</b>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Schliessen</button>
      </div>

      {offline ? (
        <div className="tip warn" style={{ marginTop: 8 }}>
          <span>🔒</span>
          <span>Der Privatmodus ist an. Schalte ihn in den Einstellungen aus, wenn du im Netz suchen willst.</span>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <input
              className="input"
              id="pic-search"
              value={term}
              placeholder="z. B. Fitnessstudio Hanteln"
              maxLength={80}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run();
              }}
            />
            <button className="btn" disabled={running || busy || !term.trim()} onClick={() => void run()}>
              {running ? '...' : 'Suchen'}
            </button>
          </div>
          <div className="hint">
            Die KI uebersetzt deine Eingabe in Suchbegriffe. Gesucht wird bei Openverse und Wikimedia Commons - der
            Suchbegriff geht dorthin, das gewaehlte Bild landet danach nur auf deinem Geraet.
          </div>
        </>
      )}

      {error && (
        <div className="tip warn" style={{ marginTop: 8 }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {hits && hits.length > 0 && (
        <>
          <div className="hint">Gesucht nach „{used}" - tippe ein Bild an.</div>
          <div className="picture-grid">
            {hits.map((hit) => (
              <button
                key={hit.thumb}
                className="picture-hit"
                disabled={busy}
                title={hit.by ? `${hit.title} - ${hit.by}` : hit.title}
                onClick={() => onPick(hit)}
              >
                <img src={hit.thumb} alt={hit.title} loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
