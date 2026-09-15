import { useEffect, useRef, useState } from 'react';
import { drawAvatar, drawPostImage } from '../sim/image';
import { photoUrl, stockPhotoUrls } from '../sim/photos';
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
  const candidates = useStock ? stockPhotoUrls(post.imageSeed, post.niche, size) : [];

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

/** Profilbild: echtes Foto, sonst der gezeichnete Avatar. */
export function AccountAvatar({ account, size = 40 }: { account: Account; size?: number }) {
  const url = usePhotoUrl(account.photoId);
  if (url) {
    return <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} />;
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
