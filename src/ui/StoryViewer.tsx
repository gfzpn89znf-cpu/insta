import { useEffect, useState } from 'react';
import { markStorySeen, toggleFollow } from '../sim/actions';
import { generateStoryText } from '../sim/content';
import { makeRng } from '../sim/rng';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { AccountAvatar, StoryMedia } from './Media';
import { Verified, relTime } from './common';

/** Story-Ansicht mit automatischem Weiterschalten. */
export default function StoryViewer({
  ids,
  startIndex,
  world,
  onClose,
  onProfile,
}: {
  ids: string[];
  startIndex: number;
  world: World;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const account = world.accounts[ids[index]];

  useEffect(() => {
    if (!account) return;
    dispatch((w) => markStorySeen(w, account.id));
    const timer = window.setTimeout(() => {
      if (index + 1 < ids.length) setIndex(index + 1);
      else onClose();
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [index, account?.id]);

  if (!account) return null;
  const text = generateStoryText(makeRng(account.storySeed));
  const follows = world.accounts[world.user.accountId].following.includes(account.id);

  return (
    <div className="story-view">
      <div className="story-top">
        <AccountAvatar account={account} size={34} />
        <div style={{ minWidth: 0 }}>
          <button className="plain-btn post-handle" onClick={() => onProfile(account.id)}>
            {account.handle} <Verified on={account.verified} />
          </button>
          <div className="post-sub">{relTime(world, account.storyAt)}</div>
        </div>
        <span className="spacer" />
        {!follows && (
          <button className="btn sm" onClick={() => dispatch((w) => toggleFollow(w, account.id))}>
            Folgen
          </button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Schliessen">×</button>
      </div>

      <div className="story-media">
        <StoryMedia account={account} size={720} stockEnabled={world.settings.stockPhotos} />
        <div className="story-bar" key={index}>
          <span />
        </div>
        <div className="story-caption">{text}</div>
        {/* Linke und rechte Haelfte schalten weiter - wie in echten Story-Ansichten. */}
        <button
          className="story-tap left"
          aria-label="Vorherige Story"
          onClick={() => (index > 0 ? setIndex(index - 1) : onClose())}
        />
        <button
          className="story-tap right"
          aria-label="Naechste Story"
          onClick={() => (index + 1 < ids.length ? setIndex(index + 1) : onClose())}
        />
      </div>

      <div className="story-foot small faint">
        {index + 1} / {ids.length} · Tippe rechts fuer die naechste Story
      </div>
    </div>
  );
}
