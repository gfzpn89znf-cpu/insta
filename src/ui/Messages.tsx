import { useState } from 'react';
import { applyDmOption } from '../sim/dms';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { Avatar, Verified, followersOf, formatShort, relTime } from './common';

const KIND_LABEL: Record<string, string> = {
  fan: 'Fan',
  brand: 'Kooperation',
  collab: 'Zusammenarbeit',
  hater: 'Kritik',
  friend: 'Kontakt',
  agency: 'Agentur',
};

export default function Messages({ world, onProfile }: { world: World; onProfile: (id: string) => void }) {
  const [active, setActive] = useState<string | null>(world.threadOrder[0] ?? null);
  const thread = active ? world.threads[active] : null;
  const partner = thread ? world.accounts[thread.accountId] : null;

  if (world.threadOrder.length === 0) {
    return (
      <div className="empty">
        <p>Dein Postfach ist leer.</p>
        <p className="small">
          Ab ein paar hundert Followern melden sich Fans. Marken schreiben dir ab etwa 2.000 Followern.
        </p>
      </div>
    );
  }

  return (
    <div className="messages">
      <div className="thread-list">
        <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Nachrichten</h2>
        {world.threadOrder.map((id) => {
          const t = world.threads[id];
          const a = t && world.accounts[t.accountId];
          if (!t || !a) return null;
          const last = t.messages[t.messages.length - 1];
          return (
            <button
              key={id}
              className={`thread-item${id === active ? ' active' : ''}`}
              onClick={() => {
                setActive(id);
                dispatch((w) => {
                  const th = w.threads[id];
                  if (th) th.unread = false;
                });
              }}
            >
              <Avatar spec={a.avatar} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="post-handle">
                  {a.handle} {t.unread && <span className="pill hot">neu</span>}
                </div>
                <div className="thread-preview">{last?.text}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div>
        {thread && partner ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="row" style={{ marginBottom: 14 }}>
              <Avatar spec={partner.avatar} size={44} />
              <div>
                <div className="post-handle" style={{ cursor: 'pointer' }} onClick={() => onProfile(partner.id)}>
                  {partner.handle} <Verified on={partner.verified} />
                </div>
                <div className="post-sub">
                  {formatShort(followersOf(partner))} Follower · {KIND_LABEL[thread.kind] ?? thread.kind}
                </div>
              </div>
            </div>

            {thread.messages.map((m) => (
              <div key={m.id}>
                <div className={`bubble${m.fromUser ? ' mine' : ''}`}>{m.text}</div>
                {m.options && !m.optionTaken && (
                  <div className="dm-options">
                    {m.options.map((o) => (
                      <button
                        key={o.id}
                        className={`btn${o.effect === 'accept' ? '' : ' secondary'} sm`}
                        onClick={() => dispatch((w) => applyDmOption(w, thread.id, o.id))}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="small faint">{relTime(world, thread.lastAt)}</div>
          </div>
        ) : (
          <div className="empty">Waehle links eine Unterhaltung.</div>
        )}
      </div>
    </div>
  );
}
