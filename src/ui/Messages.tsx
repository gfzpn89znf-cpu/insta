import type { World } from '../sim/types';
import { isTyping } from '../sim/chat';
import { AccountAvatar } from './Media';
import { Verified, formatShort, relTime } from './common';
import { followersOf } from './common';

const KIND_LABEL: Record<string, string> = {
  fan: 'Fan',
  brand: 'Kooperation',
  collab: 'Zusammenarbeit',
  hater: 'Kritik',
  friend: 'Kontakt',
  agency: 'Agentur',
};

/** Uebersicht aller Unterhaltungen. */
export default function Messages({ world, onOpenChat }: { world: World; onOpenChat: (accountId: string) => void }) {
  if (world.threadOrder.length === 0) {
    return (
      <div className="empty">
        <p>Dein Postfach ist leer.</p>
        <p className="small">
          Du kannst jeden Account direkt anschreiben: Profil oeffnen und auf „Nachricht" tippen. Ab ein paar hundert
          Followern melden sich Fans von selbst, ab etwa 2.000 auch Marken.
        </p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>Nachrichten</h2>
      {world.threadOrder.map((id) => {
        const thread = world.threads[id];
        const account = thread && world.accounts[thread.accountId];
        if (!thread || !account) return null;
        const last = thread.messages[thread.messages.length - 1];
        const typing = isTyping(thread);
        return (
          <button key={id} className="thread-item" onClick={() => onOpenChat(account.id)}>
            <AccountAvatar account={account} size={48} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="post-handle">
                {account.handle} <Verified on={account.verified} />
                {thread.unread && <span className="pill hot">neu</span>}
              </div>
              <div className="thread-preview">
                {typing ? 'schreibt...' : (last?.text ?? `${formatShort(followersOf(account))} Follower`)}
              </div>
            </div>
            <div className="small faint">
              {KIND_LABEL[thread.kind] ?? ''}
              <div>{relTime(world, thread.lastAt)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
