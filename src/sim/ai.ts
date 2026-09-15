import type Anthropic from '@anthropic-ai/sdk';

/**
 * Echte KI fuer die Accounts.
 *
 * Wenn ein eigener API-Schluessel hinterlegt ist, schreiben Claude-Modelle die
 * Nachrichten, Kommentare, Bildunterschriften und Anrufantworten. Ohne
 * Schluessel - und immer dann, wenn eine Anfrage scheitert - uebernehmen die
 * eingebauten Textbausteine. Die App funktioniert also in jedem Fall.
 *
 * Der Schluessel liegt ausschliesslich im Browser des Geraets (localStorage),
 * wird nie mitgespeichert und geht an niemanden ausser an Anthropic.
 */

const KEY_STORE = 'fotogram.ai.key';
const MODEL_STORE = 'fotogram.ai.model';
const BUDGET_STORE = 'fotogram.ai.budget';
const USAGE_STORE = 'fotogram.ai.usage';

export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', hint: 'Beste Antworten, teuerste Variante' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Guter Mittelweg' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'Am schnellsten und guenstigsten' },
] as const;

export const DEFAULT_MODEL = 'claude-opus-5';
/** Standard-Obergrenze an Anfragen pro Tag, damit nichts aus dem Ruder laeuft. */
export const DEFAULT_BUDGET = 300;

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignorieren */
  }
}

export interface AiSettings {
  apiKey: string;
  model: string;
  dailyBudget: number;
}

export function getAiSettings(): AiSettings {
  return {
    apiKey: read(KEY_STORE),
    model: read(MODEL_STORE) || DEFAULT_MODEL,
    dailyBudget: Number(read(BUDGET_STORE)) || DEFAULT_BUDGET,
  };
}

export function setAiSettings(patch: Partial<AiSettings>) {
  if (patch.apiKey !== undefined) {
    write(KEY_STORE, patch.apiKey.trim());
    client = undefined;
  }
  if (patch.model !== undefined) {
    write(MODEL_STORE, patch.model);
    client = undefined;
  }
  if (patch.dailyBudget !== undefined) write(BUDGET_STORE, String(patch.dailyBudget));
  notify();
}

/** Ist eine echte KI eingerichtet? */
export function aiReady(): boolean {
  return getAiSettings().apiKey.length > 20;
}

/* ------------------------------------------------------------------ */
/* Verbrauch                                                           */
/* ------------------------------------------------------------------ */

interface Usage {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  errors: number;
  lastError?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getUsage(): Usage {
  try {
    const raw = JSON.parse(read(USAGE_STORE) || '{}') as Partial<Usage>;
    if (raw.day === today()) {
      return {
        day: raw.day,
        requests: raw.requests ?? 0,
        inputTokens: raw.inputTokens ?? 0,
        outputTokens: raw.outputTokens ?? 0,
        errors: raw.errors ?? 0,
        lastError: raw.lastError,
      };
    }
  } catch {
    /* ignorieren */
  }
  return { day: today(), requests: 0, inputTokens: 0, outputTokens: 0, errors: 0 };
}

function saveUsage(usage: Usage) {
  write(USAGE_STORE, JSON.stringify(usage));
  notify();
}

const listeners = new Set<() => void>();

export function onAiChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  for (const fn of listeners) fn();
}

/* ------------------------------------------------------------------ */
/* Anfragen                                                            */
/* ------------------------------------------------------------------ */

let client: Anthropic | undefined;
let clientPromise: Promise<Anthropic | undefined> | undefined;

/** Laedt das SDK erst, wenn es wirklich gebraucht wird. */
async function getClient(): Promise<Anthropic | undefined> {
  if (client) return client;
  const { apiKey } = getAiSettings();
  if (!apiKey) return undefined;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((mod) => {
        client = new mod.default({
          apiKey,
          // Die App laeuft ohne Server - der Schluessel bleibt auf dem Geraet.
          dangerouslyAllowBrowser: true,
          maxRetries: 1,
        });
        return client;
      })
      .catch((err) => {
        console.warn('KI-SDK konnte nicht geladen werden', err);
        return undefined;
      })
      .finally(() => {
        clientPromise = undefined;
      });
  }
  return clientPromise;
}

export interface AskOptions {
  /** Rolle und Charakter des Gegenuebers. */
  system: string;
  /** Gespraechsverlauf. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  /** Wie gruendlich das Modell nachdenken soll. */
  effort?: 'low' | 'medium' | 'high';
}

// Nicht mehr als zwei Anfragen gleichzeitig - sonst laeuft man ins Limit.
let inFlight = 0;
const MAX_PARALLEL = 2;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_PARALLEL) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else inFlight--;
}

/**
 * Stellt eine Anfrage an Claude. Gibt null zurueck, wenn keine KI eingerichtet
 * ist, das Tagesbudget erschoepft ist oder etwas schiefgeht - dann uebernehmen
 * die eingebauten Texte.
 */
export async function ask(options: AskOptions): Promise<string | null> {
  const settings = getAiSettings();
  if (!settings.apiKey) return null;

  const usage = getUsage();
  if (usage.requests >= settings.dailyBudget) return null;

  const api = await getClient();
  if (!api) return null;

  await acquire();
  try {
    const response = await api.messages.create({
      model: settings.model,
      max_tokens: options.maxTokens ?? 400,
      system: options.system,
      // Kurze, schnelle Antworten - tiefes Nachdenken braucht ein Chat nicht.
      output_config: { effort: options.effort ?? 'low' },
      messages: options.messages,
    });

    const current = getUsage();
    saveUsage({
      ...current,
      requests: current.requests + 1,
      inputTokens: current.inputTokens + (response.usage?.input_tokens ?? 0),
      outputTokens: current.outputTokens + (response.usage?.output_tokens ?? 0),
    });

    if (response.stop_reason === 'refusal') return null;

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (error) {
    const current = getUsage();
    saveUsage({ ...current, errors: current.errors + 1, lastError: describeError(error) });
    return null;
  } finally {
    release();
  }
}

/** Uebersetzt Fehler in einen Satz, den man in den Einstellungen lesen kann. */
function describeError(error: unknown): string {
  const err = error as { constructor?: { name?: string }; status?: number; message?: string };
  const name = err?.constructor?.name ?? '';
  if (name === 'AuthenticationError' || err?.status === 401) return 'Der API-Schluessel wurde nicht akzeptiert.';
  if (name === 'PermissionDeniedError' || err?.status === 403) return 'Der Schluessel hat keinen Zugriff auf dieses Modell.';
  if (name === 'RateLimitError' || err?.status === 429) return 'Zu viele Anfragen - kurz warten.';
  if (name === 'BadRequestError' || err?.status === 400) return `Anfrage abgelehnt: ${err?.message ?? 'unbekannt'}`;
  if (err?.status && err.status >= 500) return 'Der Dienst ist gerade gestoert.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Keine Internetverbindung.';
  return err?.message ? `Fehler: ${err.message}` : 'Unbekannter Fehler.';
}

/**
 * Anfrage mit Bild: Claude schaut sich die Aufnahme an und beschreibt, was
 * darauf zu sehen ist. Damit weiss die App, worum es in einem eigenen
 * Beitrag wirklich geht.
 */
export async function askVision(
  system: string,
  text: string,
  image: { data: string; mediaType: string },
  maxTokens = 400,
): Promise<string | null> {
  const settings = getAiSettings();
  if (!settings.apiKey) return null;

  const usage = getUsage();
  if (usage.requests >= settings.dailyBudget) return null;

  const api = await getClient();
  if (!api) return null;

  await acquire();
  try {
    const response = await api.messages.create({
      model: settings.model,
      max_tokens: maxTokens,
      system,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: image.data,
              },
            },
            { type: 'text', text },
          ],
        },
      ],
    });

    const current = getUsage();
    saveUsage({
      ...current,
      requests: current.requests + 1,
      inputTokens: current.inputTokens + (response.usage?.input_tokens ?? 0),
      outputTokens: current.outputTokens + (response.usage?.output_tokens ?? 0),
    });

    if (response.stop_reason === 'refusal') return null;
    const out = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return out || null;
  } catch (error) {
    const current = getUsage();
    saveUsage({ ...current, errors: current.errors + 1, lastError: describeError(error) });
    return null;
  } finally {
    release();
  }
}

/** Holt aus einer Antwort das erste JSON-Objekt heraus. */
export function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Prueft einen Schluessel mit einer winzigen Anfrage. */
export async function testAiKey(apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const mod = await import('@anthropic-ai/sdk');
    const probe = new mod.default({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 0 });
    const response = await probe.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Antworte nur mit: ok' }],
    });
    const text = response.content.find((b) => b.type === 'text');
    return { ok: true, message: text && text.type === 'text' ? `Verbindung steht (${text.text.trim()})` : 'Verbindung steht.' };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

/** Holt aus einer Antwort das erste JSON-Array heraus. */
export function parseJsonArray(text: string | null): unknown[] | null {
  if (!text) return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
