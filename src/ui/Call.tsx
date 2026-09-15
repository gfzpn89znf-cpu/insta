import { useEffect, useMemo, useRef, useState } from 'react';
import { planCall } from '../sim/calls';
import { formatDuration, logCall, raiseCloseness } from '../sim/chat';
import { dispatch } from '../sim/store';
import { makeRng } from '../sim/rng';
import type { Account, World } from '../sim/types';
import { AccountAvatar, StoryMedia } from './Media';

type Phase = 'ringing' | 'incoming' | 'active' | 'ended';

const SPEECH_KEY = 'fotogram.speech';

function speechEnabled(): boolean {
  try {
    return localStorage.getItem(SPEECH_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Laesst das Gegenueber wirklich sprechen, wenn der Browser das kann. */
function speak(text: string, account: Account, enabled: boolean) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    // Jede Person klingt etwas anders.
    const rng = makeRng(account.avatar.seed);
    utterance.pitch = 0.75 + rng() * 0.7;
    utterance.rate = 0.95 + rng() * 0.2;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  } catch {
    /* ohne Sprachausgabe weiter */
  }
}

function stopSpeaking() {
  try {
    speechSynthesis?.cancel();
  } catch {
    /* ignorieren */
  }
}

/** Anrufbildschirm - ausgehend und eingehend. */
export default function Call({
  world,
  accountId,
  video,
  incoming,
  onClose,
}: {
  world: World;
  accountId: string;
  video: boolean;
  incoming?: boolean;
  onClose: () => void;
}) {
  const account = world.accounts[accountId];
  const plan = useMemo(() => planCall(world, accountId, video), [accountId, video]);
  const [phase, setPhase] = useState<Phase>(incoming ? 'incoming' : 'ringing');
  const [seconds, setSeconds] = useState(0);
  const [subtitle, setSubtitle] = useState('');
  const [muted, setMuted] = useState(false);
  const [speech, setSpeech] = useState(speechEnabled);
  const [endReason, setEndReason] = useState('');
  const lineIndex = useRef(0);
  const logged = useRef(false);

  // Klingeln: entweder nimmt jemand ab oder eben nicht.
  useEffect(() => {
    if (phase !== 'ringing') return;
    const answers = incoming ? true : plan.answers;
    const timer = window.setTimeout(() => {
      if (answers) {
        setPhase('active');
      } else {
        setEndReason(plan.reason ?? 'Niemand ist rangegangen.');
        setPhase('ended');
      }
    }, plan.ringMs);
    return () => window.clearTimeout(timer);
  }, [phase, plan, incoming]);

  // Eingehender Anruf: vibrieren, solange er klingelt.
  useEffect(() => {
    if (phase !== 'incoming') return;
    try {
      navigator.vibrate?.([400, 250, 400, 250]);
    } catch {
      /* ignorieren */
    }
    const timeout = window.setTimeout(() => {
      setEndReason('Anruf verpasst.');
      setPhase('ended');
    }, 20000);
    return () => {
      window.clearTimeout(timeout);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* ignorieren */
      }
    };
  }, [phase]);

  // Laufendes Gespraech: Uhr und Gespraechsverlauf.
  useEffect(() => {
    if (phase !== 'active' || !account) return;
    setSubtitle(plan.greeting);
    speak(plan.greeting, account, speech && !muted);

    const tick = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    const talk = window.setInterval(() => {
      const line = plan.lines[lineIndex.current % Math.max(1, plan.lines.length)];
      lineIndex.current += 1;
      if (!line) return;
      setSubtitle(line);
      speak(line, account, speech && !muted);
    }, 7000);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(talk);
      stopSpeaking();
    };
  }, [phase, account?.id]);

  // Gespraech in der Unterhaltung vermerken - genau einmal.
  useEffect(() => {
    if (phase !== 'ended' || logged.current || !account) return;
    logged.current = true;
    const missed = seconds === 0;
    dispatch((w) => logCall(w, accountId, seconds, missed, video));
  }, [phase, seconds, accountId, video, account]);

  useEffect(() => stopSpeaking, []);

  if (!account) return null;

  const hangUp = () => {
    stopSpeaking();
    if (phase === 'active') {
      setEndReason(`Gespraech beendet · ${formatDuration(seconds)}`);
      setPhase('ended');
    } else {
      onClose();
    }
  };

  const accept = () => {
    dispatch((w) => raiseCloseness(w, accountId, 0.06));
    setPhase('active');
  };

  const decline = () => {
    setEndReason('Anruf abgelehnt.');
    setPhase('ended');
  };

  const toggleSpeech = () => {
    const next = !speech;
    setSpeech(next);
    if (!next) stopSpeaking();
    try {
      localStorage.setItem(SPEECH_KEY, next ? 'on' : 'off');
    } catch {
      /* ignorieren */
    }
  };

  const status =
    phase === 'incoming'
      ? `Eingehender ${video ? 'Videoanruf' : 'Anruf'}...`
      : phase === 'ringing'
        ? 'Klingelt...'
        : phase === 'active'
          ? formatDuration(seconds)
          : endReason;

  return (
    <div className={`call-screen${video && phase === 'active' ? ' video' : ''}`}>
      {video && phase === 'active' && (
        <div className="call-video">
          <StoryMedia account={account} size={720} stockEnabled={world.settings.stockPhotos} />
          <div className="call-self">
            <AccountAvatar account={world.accounts[world.user.accountId]} size={96} />
          </div>
        </div>
      )}

      <div className="call-info">
        {!(video && phase === 'active') && (
          <div className={`call-avatar${phase === 'ringing' || phase === 'incoming' ? ' pulsing' : ''}`}>
            <AccountAvatar account={account} size={124} />
          </div>
        )}
        <h2 className="call-name">{account.name}</h2>
        <div className="call-handle">@{account.handle}</div>
        <div className="call-status">{status}</div>
        {phase === 'active' && subtitle && <div className="call-subtitle">{subtitle}</div>}
      </div>

      <div className="call-actions">
        {phase === 'incoming' ? (
          <>
            <button className="call-btn decline" onClick={decline} aria-label="Ablehnen">✕</button>
            <button className="call-btn accept" onClick={accept} aria-label="Annehmen">✓</button>
          </>
        ) : phase === 'ended' ? (
          <button className="btn full" onClick={onClose}>Schliessen</button>
        ) : (
          <>
            <button
              className={`call-btn side${muted ? ' on' : ''}`}
              onClick={() => {
                setMuted((m) => !m);
                stopSpeaking();
              }}
              aria-label={muted ? 'Mikrofon an' : 'Mikrofon aus'}
              title={muted ? 'Mikrofon an' : 'Mikrofon aus'}
            >
              {muted ? '🔇' : '🎤'}
            </button>
            <button className="call-btn decline" onClick={hangUp} aria-label="Auflegen">✕</button>
            <button
              className={`call-btn side${speech ? ' on' : ''}`}
              onClick={toggleSpeech}
              aria-label={speech ? 'Sprachausgabe aus' : 'Sprachausgabe an'}
              title={speech ? 'Sprachausgabe aus' : 'Sprachausgabe an'}
            >
              🔊
            </button>
          </>
        )}
      </div>
    </div>
  );
}
