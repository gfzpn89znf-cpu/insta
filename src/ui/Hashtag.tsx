import { useMemo } from 'react';
import { searchHashtag } from '../sim/feed';
import type { World } from '../sim/types';
import { GridTile } from './PostCard';
import ScreenHeader from './Screen';
import { formatShort } from './common';

/** Alle Beitraege zu einem Hashtag. */
export default function Hashtag({
  world,
  tag,
  onBack,
  onOpen,
}: {
  world: World;
  tag: string;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const posts = useMemo(() => searchHashtag(world, tag, 45), [tag, world.time]);
  const trend = world.trends.find((t) => t.tag === tag);

  return (
    <div className="screen">
      <ScreenHeader
        title={`#${tag}`}
        subtitle={
          trend
            ? `Im Trend · ${formatShort(trend.posts)} Beitraege`
            : `${formatShort(posts.length)} sichtbare Beitraege`
        }
        onBack={onBack}
      />
      <div className="screen-body">
        {posts.length === 0 ? (
          <div className="empty">Zu diesem Hashtag gibt es gerade nichts.</div>
        ) : (
          <div className="grid">
            {posts.map((p) => (
              <GridTile key={p.id} post={p} onOpen={onOpen} stockEnabled={world.settings.stockPhotos} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
