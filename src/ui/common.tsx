import { useEffect, useRef, type ReactNode } from 'react';
import { drawAvatar, drawPostImage } from '../sim/image';
import { formatFull, formatShort } from '../sim/content';
import type { Account, AvatarSpec, NicheId, Post, StyleId, World } from '../sim/types';

export { formatShort, formatFull };

/* ---------------- Zeitangaben ---------------- */

/** Relative Zeitangabe wie "vor 3 Std." aus Simulationsminuten. */
export function relTime(world: World, t: number): string {
  const mins = Math.max(0, world.time - t);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${Math.floor(mins)} Min.`;
  if (mins < 1440) return `vor ${Math.floor(mins / 60)} Std.`;
  const days = Math.floor(mins / 1440);
  if (days < 7) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  if (days < 60) return `vor ${Math.floor(days / 7)} Wo.`;
  return `vor ${Math.floor(days / 30)} Mon.`;
}

/** Simulationsuhr: Tag und Uhrzeit. */
export function clockOf(world: World): { day: number; hour: number; minute: number; label: string } {
  const day = Math.floor(world.time / 1440) + 1;
  const hour = Math.floor((world.time % 1440) / 60);
  const minute = Math.floor(world.time % 60);
  return { day, hour, minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

export function followersOf(a: Account): number {
  return a.realFollowers.length + a.crowdFollowers;
}

export function followingOf(a: Account): number {
  return a.following.length + a.crowdFollowing;
}

/* ---------------- Avatar ---------------- */

export function Avatar({ spec, size = 40 }: { spec: AvatarSpec; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawAvatar(ref.current, spec);
  }, [spec.seed, spec.hue, spec.hue2, spec.shape, spec.initials]);
  const px = Math.round(size * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1));
  return <canvas ref={ref} className="avatar" width={px} height={px} style={{ width: size, height: size }} />;
}

/** Avatar mit Story-Ring, falls der Account gerade eine Story hat. */
export function StoryAvatar({
  account,
  world,
  size = 56,
  onClick,
}: {
  account: Account;
  world: World;
  size?: number;
  onClick?: () => void;
}) {
  const hasStory = world.time - account.storyAt < 1440;
  const seen = world.user.seenStories.includes(account.id);
  if (!hasStory) {
    return (
      <span onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex' }}>
        <Avatar spec={account.avatar} size={size} />
      </span>
    );
  }
  return (
    <span className={`avatar-ring${seen ? ' seen' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <span className="inner">
        <Avatar spec={account.avatar} size={size} />
      </span>
    </span>
  );
}

export function Verified({ on }: { on: boolean }) {
  return on ? <span className="verified" title="Verifiziert">✔</span> : null;
}

/* ---------------- Beitragsbild ---------------- */

export function PostImage({
  seed,
  niche,
  style,
  size = 480,
  eager = false,
}: {
  seed: number;
  niche: NicheId;
  style: StyleId;
  size?: number;
  /** Sofort zeichnen statt erst beim Sichtbarwerden. */
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

    // Ein Feed zeigt Dutzende Bilder. Sie alle sofort zu zeichnen kostet auf
    // langsamen Geraeten Sekunden - also erst, wenn sie in die Naehe des
    // Sichtbereichs kommen.
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

  return <canvas ref={ref} width={size} height={size} style={{ background: 'var(--surface-2)' }} />;
}

/* ---------------- Modal ---------------- */

export function Modal({
  children,
  onClose,
  narrow,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  narrow?: boolean;
  title?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${narrow ? ' narrow' : ''}`} onClick={(e) => e.stopPropagation()}>
        {title !== undefined && (
          <div className="modal-head">
            <b>{title}</b>
            <button className="icon-btn" onClick={onClose} aria-label="Schliessen">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------------- Kleinteile ---------------- */

export function Meter({ value }: { value: number }) {
  return (
    <div className="meter">
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function ScoreRow({ name, value }: { name: string; value: number }) {
  return (
    <div className="score-row">
      <span className="name">{name}</span>
      <Meter value={value} />
      <span className="val">{Math.round(value * 100)}</span>
    </div>
  );
}

/** Caption mit klickbaren Hashtags. */
export function CaptionText({ text, onTag }: { text: string; onTag?: (tag: string) => void }) {
  const parts = text.split(/(#[\wäöüÄÖÜß]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('#') ? (
          <span key={i} className="hashtag" style={{ cursor: onTag ? 'pointer' : undefined }} onClick={() => onTag?.(p.slice(1))}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function engagementRate(post: Post): number {
  return post.metrics.likes / Math.max(1, post.metrics.impressions);
}

/** Einfaches Liniendiagramm als SVG. */
export function LineChart({
  points,
  height = 190,
  color = '#ee2a7b',
}: {
  points: { x: number; y: number }[];
  height?: number;
  color?: string;
}) {
  if (points.length < 2) {
    return <div className="empty small">Noch nicht genug Daten fuer einen Verlauf.</div>;
  }
  const w = 600;
  const h = height;
  const pad = 22;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys, 1);
  const sx = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);
  const sy = (y: number) => h - pad - (y / maxY) * (h - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${sx(maxX).toFixed(1)},${h - pad} L${sx(minX).toFixed(1)},${h - pad} Z`;

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad} y1={pad + t * (h - pad * 2)} x2={w - pad} y2={pad + t * (h - pad * 2)} stroke="#26262c" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#chartFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <text x={pad} y={pad - 7} fill="#6b6b76" fontSize="11">{formatShort(maxY)}</text>
    </svg>
  );
}
