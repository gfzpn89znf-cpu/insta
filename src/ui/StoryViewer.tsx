import { useEffect, useState } from 'react';
import { markStorySeen, toggleFollow } from '../sim/actions';
import { generateStoryText } from '../sim/content';
import { NICHES } from '../sim/niches';
import { makeRng } from '../sim/rng';
import { dispatch } from '../sim/store';
import type { Account, StyleId, World } from '../sim/types';
import { Avatar, Modal, PostImage, Verified, relTime } from './common';

/** Story-Ansicht mit automatischem Weiterschalten. */
export default function StoryViewer({
  accounts,
  startIndex,
  world,
  onClose,
  onProfile,
}: {
  accounts: Account[];
  startIndex: number;
  world: World;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const account = accounts[index];

  useEffect(() => {
    if (!account) return;
    dispatch((w) => markStorySeen(w, account.id));
    const timer = window.setTimeout(() => {
      if (index + 1 < accounts.length) setIndex(index + 1);
      else onClose();
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [index, account?.id]);

  if (!account) return null;
  const rng = makeRng(account.storySeed);
  const text = generateStoryText(rng);
  const style = NICHES[account.niche].styles[0] as StyleId;
  const follows = world.accounts[world.user.accountId].following.includes(account.id);

  return (
    <Modal onClose={onClose}>
      <div className="modal-body story-view">
        <div className="row" style={{ marginBottom: 10 }}>
          <Avatar spec={account.avatar} size={34} />
          <div>
            <div className="post-handle" style={{ cursor: 'pointer' }} onClick={() => onProfile(account.id)}>
              {account.handle} <Verified on={account.verified} />
            </div>
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
          <PostImage seed={account.storySeed} niche={account.niche} style={style} size={520} />
          <div className="story-bar" key={index}>
            <span />
          </div>
          <div className="story-caption">{text}</div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn secondary sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ← Zurueck
          </button>
          <span className="spacer" />
          <span className="small faint">{index + 1} / {accounts.length}</span>
          <span className="spacer" />
          <button className="btn secondary sm" onClick={() => (index + 1 < accounts.length ? setIndex(index + 1) : onClose())}>
            Weiter →
          </button>
        </div>
      </div>
    </Modal>
  );
}
