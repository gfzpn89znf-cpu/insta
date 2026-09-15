import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiReady } from '../sim/ai';
import { planCall } from '../sim/calls';
import { askCallReply, formatDuration, logCall, raiseCloseness } from '../sim/chat';
import { dispatch } from '../sim/store';
import { makeRng } from '../sim/rng';
import type { Account, World } from '../sim/types';
import { AccountAvatar, StoryMedia } from './Media';

type Phase = 'ringing' | 'incoming' | 'active' | 'ended';

const SPEECH_KEY = 'fotogram.speech';

function speechAllowed(): boolean {
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
    speechSynthesis.cancel();
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

/** Spracherkennung des Browsers, falls vorhanden. */
type Recognition = {
  start(): void;
  stop(): void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function createRecognition(): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = false;
  return recognition;
}

interface Line {
  from: 'them' | 'me';
  text: string;
}

/** Anrufbildschirm - ausgehend und eingehend, mit echtem Gespraech. */
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
  const [lines, setLines] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [typed, setTyped] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [speechOn, setSpeechOn] = useState(speechAllowed);
  const [endReason, setEndReason] = useState('');
  const scriptIndex = useRef(0);
  const logged = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const smart = aiReady();

  const lastLine = lines[lines.length - 1];

  /** Antwort des Gegenuebers holen - echte KI, sonst das vorbereitete Skript. */
  const respond = useCallback(
    async (history: Line[]) => {
      if (!account) return;
      setThinking(true);
      let answer: string | null = null;
      if (smart) {
        answer = await askCallReply(
          world,
          accountId,
          history.map((l) => ({ role: l.from === 'me' ? ('user' as const) : ('assistant' as const), content: l.text })),
        );
      }
      if (!answer) {
        answer = plan.lines[scriptIndex.current % Math.max(1, plan.lines.length)] ?? 'Ja, genau.';
        scriptIndex.current += 1;
      }
      setThinking(false);
      setLines((prev) => [...prev, { from: 'them', text: answer! }]);
      speak(answer, account, speechOn);
    },
    [account, accountId, plan.lines, smart, speechOn, world],
  );

  // Klingeln: entweder nimmt jemand ab oder eben nicht.
  useEffect(() => {
    if (phase !== 'ringing') return;
    const timer = window.setTimeout(() => {
      if (plan.answers) setPhase('active');
      else {
        setEndReason(plan.reason ?? 'Niemand ist rangegangen.');
        setPhase('ended');
      }
    }, plan.ringMs);
    return () => window.clearTimeout(timer);
  }, [phase, plan]);

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

  // Gespraech beginnt: Begruessung und laufende Uhr.
  useEffect(() => {
    if (phase !== 'active' || !account) return;
    const greeting = plan.greeting || 'Hey!';
    setLines([{ from: 'them', text: greeting }]);
    speak(greeting, account, speechOn);
    const tick = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      window.clearInterval(tick);
      stopSpeaking();
    };
  }, [phase, account?.id]);

  // Ohne echte KI erzaehlt das Gegenueber von selbst weiter.
  useEffect(() => {
    if (phase !== 'active' || smart || !account) return;
    const talk = window.setInterval(() => {
      const line = plan.lines[scriptIndex.current % Math.max(1, plan.lines.length)];
      scriptIndex.current += 1;
      if (!line) return;
      setLines((prev) => [...prev, { from: 'them', text: line }]);
      speak(line, account, speechOn);
    }, 8000);
    return () => window.clearInterval(talk);
  }, [phase, smart, account?.id, speechOn, plan.lines]);

  // Gespraech in der Unterhaltung vermerken - genau einmal.
  useEffect(() => {
    if (phase !== 'ended' || logged.current || !account) return;
    logged.current = true;
    dispatch((w) => logCall(w, accountId, seconds, seconds === 0, video));
  }, [phase, seconds, accountId, video, account]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      recognition.current?.stop();
    };
  }, []);

  if (!account) return null;

  const say = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const next: Line[] = [...lines, { from: 'me' as const, text: clean }];
    setLines(next);
    setTyped('');
    void respond(next);
  };

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const rec = createRecognition();
    if (!rec) {
      setShowInput(true);
      return;
    }
    stopSpeaking();
    recognition.current = rec;
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      setListening(false);
      if (transcript) say(transcript);
    };
    rec.onerror = () => {
      setListening(false);
      setShowInput(true);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setShowInput(true);
    }
  };

  const hangUp = () => {
    stopSpeaking();
    recognition.current?.stop();
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

  const toggleSpeech = () => {
    const next = !speechOn;
    setSpeechOn(next);
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
            <AccountAvatar account={world.accounts[world.user.accountId]} size={92} />
          </div>
        </div>
      )}

      <div className="call-info">
        {!(video && phase === 'active') && (
          <div className={`call-avatar${phase === 'ringing' || phase === 'incoming' ? ' pulsing' : ''}`}>
            <AccountAvatar account={account} size={118} />
          </div>
        )}
        <h2 className="call-name">{account.name}</h2>
        <div className="call-handle">@{account.handle}</div>
        <div className="call-status">{status}</div>

        {phase === 'active' && (
          <>
            {lastLine && (
              <div className={`call-subtitle${lastLine.from === 'me' ? ' mine' : ''}`}>
                {lastLine.from === 'me' ? 'Du: ' : ''}
                {lastLine.text}
              </div>
            )}
            {thinking && <div className="call-hint">{account.name.split(' ')[0]} ueberlegt...</div>}
            {listening && <div className="call-hint listening">Ich hoere zu - sprich einfach.</div>}
            {!listening && !thinking && (
              <div className="call-hint">
                {smart ? 'Tippe auf das Mikrofon und sprich.' : 'Ohne eigenen KI-Schluessel erzaehlt dein Gegenueber nur vor sich hin.'}
              </div>
            )}
            {showInput && (
              <div className="row call-typing">
                <input
                  className="input"
                  id="call-input"
                  value={typed}
                  placeholder="Antwort tippen..."
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') say(typed);
                  }}
                />
                <button className="btn sm" onClick={() => say(typed)} disabled={!typed.trim()}>
                  Sagen
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="call-actions">
        {phase === 'incoming' ? (
          <>
            <button className="call-btn decline" onClick={() => { setEndReason('Anruf abgelehnt.'); setPhase('ended'); }} aria-label="Ablehnen">✕</button>
            <button className="call-btn accept" onClick={accept} aria-label="Annehmen">✓</button>
          </>
        ) : phase === 'ended' ? (
          <button className="btn full" onClick={onClose}>Schliessen</button>
        ) : (
          <>
            <button
              className={`call-btn side${listening ? ' on' : ''}`}
              onClick={toggleListening}
              disabled={phase !== 'active'}
              aria-label={listening ? 'Aufnahme beenden' : 'Sprechen'}
              title={listening ? 'Aufnahme beenden' : 'Sprechen'}
            >
              🎤
            </button>
            <button className="call-btn decline" onClick={hangUp} aria-label="Auflegen">✕</button>
            <button
              className={`call-btn side${speechOn ? ' on' : ''}`}
              onClick={toggleSpeech}
              aria-label={speechOn ? 'Sprachausgabe aus' : 'Sprachausgabe an'}
              title={speechOn ? 'Sprachausgabe aus' : 'Sprachausgabe an'}
            >
              🔊
            </button>
            {phase === 'active' && !showInput && (
              <button className="call-btn side" onClick={() => setShowInput(true)} aria-label="Tippen statt sprechen" title="Tippen statt sprechen">
                ⌨
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
