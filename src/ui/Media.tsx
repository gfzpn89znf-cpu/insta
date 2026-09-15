import { useEffect, useRef, useState } from 'react';
import { drawAvatar, drawPostImage } from '../sim/image';
import { guessFemale } from '../sim/names';
import { photoUrl, portraitUrl, stockPhotoUrls } from '../sim/photos';
import type { Account, AvatarSpec, NicheId, Post, StyleId } from '../sim/types';

/** Adresse eines gespeicherten Fotos laden. */
export function usePhotoUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let alive = true;
    void photoUrl(id).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Gezeichnetes Bild - der Rueckfall, wenn kein Foto verfuegbar ist. */
function GeneratedImage({
  seed,
  niche,
  style,
  size,
  eager,
}: {
  seed: number;
  niche: NicheId;
  style: StyleId;
  size: number;
  eager?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef('');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const key = `${seed}|${niche}|${style}|${size}`;
    const paint = () => {
      if (drawn.current === key || !ref.current) return;
      drawn.current = key;
      drawPostImage(ref.current, { seed, niche, style });
    };

    // Dutzende Bilder gleichzeitig zu zeichnen kostet auf langsamen Geraeten
    // Sekunden - also erst, wenn sie in die Naehe des Sichtbereichs kommen.
    if (eager || typeof IntersectionObserver === 'undefined') {
      paint();
      return;
    }
    drawn.current = '';
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          paint();
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [seed, niche, style, size, eager]);

  return <canvas ref={ref} width={size} height={size} className="media-canvas" />;
}

/**
 * Das Bild eines Beitrags: eigenes Foto, echtes Foto aus dem Netz oder
 * gezeichnetes Motiv. Faellt automatisch auf die naechste Quelle zurueck,
 * wenn eine nicht laedt - die App sieht also auch ohne Internet vollstaendig aus.
 */
export function PostMedia({
  post,
  size = 600,
  eager,
  stockEnabled = true,
}: {
  post: Post;
  size?: number;
  eager?: boolean;
  stockEnabled?: boolean;
}) {
  const uploaded = usePhotoUrl(post.photoSource === 'upload' ? post.photoId : undefined);
  const [sourceIndex, setSourceIndex] = useState(0);
  const useStock = post.photoSource === 'stock' && stockEnabled;
  const candidates = useStock ? stockPhotoUrls(post.imageSeed, post.niche, size, post.topic) : [];

  useEffect(() => {
    setSourceIndex(0);
  }, [post.id, size]);

  if (post.photoSource === 'upload') {
    if (!uploaded) return <div className="media-placeholder" />;
    return <img className="media-img" src={uploaded} alt="" loading="lazy" decoding="async" />;
  }

  if (useStock && sourceIndex < candidates.length) {
    return (
      <img
        className="media-img"
        src={candidates[sourceIndex]}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        // Dienst nicht erreichbar? Naechste Quelle, sonst gezeichnetes Bild.
        onError={() => setSourceIndex((i) => i + 1)}
      />
    );
  }

  return <GeneratedImage seed={post.imageSeed} niche={post.niche} style={post.style} size={size} eager={eager} />;
}

/**
 * Steuert, ob Fotos aus dem Netz geladen werden duerfen. Wird aus den
 * Einstellungen gesetzt, damit nicht jede Avatar-Stelle die Welt kennen muss.
 */
let stockAllowed = true;

export function setStockPhotosAllowed(value: boolean) {
  stockAllowed = value;
}

/** Profilbild: eigenes Foto, echtes Portrait oder gezeichneter Avatar. */
export function AccountAvatar({ account, size = 40 }: { account: Account; size?: number }) {
  const uploaded = usePhotoUrl(account.photoId);
  const [portraitFailed, setPortraitFailed] = useState(false);

  useEffect(() => {
    setPortraitFailed(false);
  }, [account.id]);

  if (uploaded) {
    return (
      <img
        className="avatar"
        src={uploaded}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover' }}
      />
    );
  }

  // KI-Accounts bekommen ein echtes Gesicht - der Nutzer behaelt seinen Avatar,
  // solange er kein eigenes Foto gesetzt hat.
  if (!account.isUser && stockAllowed && !portraitFailed) {
    return (
      <img
        className="avatar"
        src={portraitUrl(account.id, guessFemale(account.name), size)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={() => setPortraitFailed(true)}
      />
    );
  }

  return <Avatar spec={account.avatar} size={size} />;
}

export function Avatar({ spec, size = 40 }: { spec: AvatarSpec; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawAvatar(ref.current, spec);
  }, [spec.seed, spec.hue, spec.hue2, spec.shape, spec.initials]);
  const px = Math.round(size * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1));
  return <canvas ref={ref} className="avatar" width={px} height={px} style={{ width: size, height: size }} />;
}

/**
 * Medium eines Reels: entweder ein echtes Video oder ein Foto mit langsamer
 * Kamerafahrt. Fuer Fotos gibt es keine Video-Quelle im Netz, die ohne
 * Zugangsschluessel zum Thema passt - die Bewegung erzeugt die App deshalb
 * selbst, statt ein unpassendes Video zu zeigen.
 */
export function ReelMedia({
  post,
  active,
  muted,
  stockEnabled = true,
}: {
  post: Post;
  active: boolean;
  muted: boolean;
  stockEnabled?: boolean;
}) {
  const videoUrl = usePhotoUrl(post.videoId);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      // Autoplay klappt auf dem Handy nur stumm - der Ton wird zugeschaltet.
      void el.play().catch(() => undefined);
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [active, videoUrl]);

  if (post.videoId) {
    if (!videoUrl) return <div className="media-placeholder" />;
    return (
      <video
        ref={videoRef}
        className="reel-media"
        src={videoUrl}
        muted={muted}
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <div className={`reel-media ken-burns${active ? ' running' : ''}`}>
      <PostMedia post={post} size={720} eager={active} stockEnabled={stockEnabled} />
    </div>
  );
}

/** Bild einer Story - gleiche Logik wie beim Beitrag. */
export function StoryMedia({ account, size = 540, stockEnabled = true }: { account: Account; size?: number; stockEnabled?: boolean }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const candidates = stockEnabled ? stockPhotoUrls(account.storySeed, account.niche, size) : [];
  if (sourceIndex < candidates.length) {
    return (
      <img
        className="media-img"
        src={candidates[sourceIndex]}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setSourceIndex((i) => i + 1)}
      />
    );
  }
  return <GeneratedImage seed={account.storySeed} niche={account.niche} style={'vivid' as StyleId} size={size} eager />;
}
