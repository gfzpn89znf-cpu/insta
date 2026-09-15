import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDmOption } from '../sim/dms';
import { isTyping, openChat, sendMessage } from '../sim/chat';
import { dispatch } from '../sim/store';
import type { World } from '../sim/types';
import { AccountAvatar } from './Media';
import ScreenHeader from './Screen';
import { Verified, followersOf, formatShort, relTime } from './common';

const QUICK = ['Hey! 👋', 'Dein letzter Beitrag ist stark.', 'Hast du einen Tipp fuer mich?', 'Wollen wir mal was zusammen machen?'];

/** Unterhaltung mit einem Account - schreiben, antworten, anrufen. */
export default function Chat({
  world,
  accountId,
  onBack,
  onProfile,
  onCall,
}: {
  world: World;
  accountId: string;
  onBack: () => void;
  onProfile: (id: string) => void;
  onCall: (id: string, video: boolean) => void;
}) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const account = world.accounts[accountId];

  // Unterhaltung anlegen, sobald der Bildschirm geoeffnet wird.
  const threadId = useMemo(() => dispatch((w) => openChat(w, accountId)) ?? '', [accountId]);
  const thread = world.threads[threadId];
  const typing = isTyping(thread);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length, typing]);

  useEffect(() => {
    if (thread?.unread) dispatch((w) => { const t = w.threads[threadId]; if (t) t.unread = false; });
  }, [thread?.unread, threadId]);

  if (!account) return null;

  const send = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    dispatch((w) => sendMessage(w, threadId, clean));
    setText('');
  };

  return (
    <div className="screen chat-screen">
      <ScreenHeader
        title={
          <button className="plain-btn row" onClick={() => onProfile(account.id)}>
            <AccountAvatar account={account} size={32} />
            <span style={{ marginLeft: 8 }}>
              {account.handle} <Verified on={account.verified} />
            </span>
          </button>
        }
        subtitle={typing ? 'schreibt...' : `${formatShort(followersOf(account))} Follower`}
        onBack={onBack}
        right={
          <>
            <button className="icon-btn" onClick={() => onCall(account.id, false)} aria-label="Anrufen" title="Anrufen">
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path
                  d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button className="icon-btn" onClick={() => onCall(account.id, true)} aria-label="Videoanruf" title="Videoanruf">
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path d="M3 6.5h11a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 16V8A1.5 1.5 0 0 1 3 6.5Z" fill="currentColor" />
                <path d="m17 10.5 4-2.6v8.2l-4-2.6z" fill="currentColor" />
              </svg>
            </button>
          </>
        }
      />

      <div className="chat-body">
        {(!thread || thread.messages.length === 0) && (
          <div className="chat-intro">
            <AccountAvatar account={account} size={72} />
            <div className="bold" style={{ marginTop: 10 }}>{account.name}</div>
            <div className="muted small">{account.bio}</div>
            <div className="hint">Schreib die erste Nachricht - oder ruf einfach an.</div>
          </div>
        )}

        {thread?.messages.map((m) => {
          if (m.call) {
            return (
              <div key={m.id} className="call-note">
                {m.call.missed ? '📵' : m.call.video ? '📹' : '📞'} {m.text}
              </div>
            );
          }
          return (
            <div key={m.id} className={`bubble${m.fromUser ? ' mine' : ''}`}>
              {m.text}
              {m.options && !m.optionTaken && (
                <div className="dm-options">
                  {m.options.map((o) => (
                    <button
                      key={o.id}
                      className={`btn${o.effect === 'accept' ? '' : ' secondary'} sm`}
                      onClick={() => dispatch((w) => applyDmOption(w, threadId, o.id))}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="bubble-time">{relTime(world, m.at)}</div>
            </div>
          );
        })}

        {typing && (
          <div className="bubble typing" aria-label="schreibt gerade">
            <span /><span /><span />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input">
        {(!thread || thread.messages.length === 0) && (
          <div className="chips quick-replies">
            {QUICK.map((q) => (
              <button key={q} className="chip" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <input
            className="input"
            value={text}
            placeholder="Nachricht schreiben..."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(text);
            }}
          />
          <button className="btn sm" disabled={!text.trim()} onClick={() => send(text)}>
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}
