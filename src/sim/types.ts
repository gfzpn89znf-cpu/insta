/** Zentrale Datenstrukturen der Simulation. */

export type NicheId =
  | 'fitness'
  | 'food'
  | 'travel'
  | 'fashion'
  | 'art'
  | 'photo'
  | 'tech'
  | 'gaming'
  | 'music'
  | 'pets'
  | 'beauty'
  | 'lifestyle'
  | 'cars'
  | 'nature'
  | 'comedy'
  | 'dance';

export type StyleId =
  | 'vivid'
  | 'film'
  | 'mono'
  | 'golden'
  | 'studio'
  | 'neon'
  | 'pastel'
  | 'moody';

/** Charaktereigenschaften eines Accounts - steuern sein komplettes Verhalten. */
export interface Traits {
  /** Grundqualitaet der Inhalte. */
  charisma: number;
  /** Regelmaessigkeit des Postens. */
  consistency: number;
  /** Basis-Posts pro Tag. */
  activity: number;
  /** Wie oft der Account selbst liked/kommentiert. */
  sociability: number;
  /** Wahrscheinlichkeit, zurueckzufolgen. */
  followBack: number;
  /** Wie stark Trends aufgegriffen werden. */
  trendChasing: number;
  /** Echtheit - haelt Follower langfristig (Gegenteil: Engagement-Bait). */
  authenticity: number;
  /** Wachstumsdrang - beeinflusst Follow-Verhalten. */
  ambition: number;
  /** Persoenliches Glueck - wie stark der Algorithmus dem Account zuspielt. */
  luck: number;
}

/** Bauplan fuer prozedural erzeugte Avatare. */
export interface AvatarSpec {
  seed: number;
  hue: number;
  hue2: number;
  shape: number;
  initials: string;
}

export interface Account {
  id: string;
  handle: string;
  name: string;
  bio: string;
  niche: NicheId;
  secondNiche: NicheId;
  avatar: AvatarSpec;
  /** Eigenes Profilfoto statt des gezeichneten Avatars. */
  photoId?: string;
  isUser: boolean;
  verified: boolean;
  /** Simulationszeit (Minuten) der Account-Erstellung. */
  createdAt: number;
  traits: Traits;
  /** Konkrete Follower aus der simulierten Welt. */
  realFollowers: string[];
  /** Anonyme Masse - zusammen mit realFollowers die angezeigte Followerzahl. */
  crowdFollowers: number;
  following: string[];
  /** Anonyme Accounts, denen dieser Account folgt (nur Anzeige). */
  crowdFollowing: number;
  postIds: string[];
  /** Insgesamt veroeffentlichte Beitraege - auch die, die nicht mehr vorgehalten werden. */
  postsTotal: number;
  totalLikes: number;
  totalImpressions: number;
  /** Verlauf der Followerzahl fuer Diagramme. */
  history: HistoryPoint[];
  lastPostAt: number;
  nextPostAt: number;
  /** Aufeinanderfolgende Tage mit mindestens einem Post. */
  streak: number;
  /** Aktuelle Wachstumsdynamik (Follower/Tag, geglaettet). */
  momentum: number;
  /** Interessenverteilung der Zielgruppe ueber alle Nischen. */
  audience: Partial<Record<NicheId, number>>;
  /** Bevorzugte Aktivzeit (Stunde 0-23). */
  peakHour: number;
  storyAt: number;
  storySeed: number;
  /** Erreichte Meilensteine, damit sie nur einmal feiern. */
  milestones: number[];
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  at: number;
  likes: number;
  /** Antwort des Nutzers auf diesen Kommentar. */
  reply?: string;
}

export interface PostMetrics {
  impressions: number;
  /** Impressions ueber Follower-Feed. */
  reachFollowers: number;
  /** Impressions ueber Explore/Vorschlaege. */
  reachExplore: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  /** Follower, die dieser Post dem Autor gebracht hat. */
  newFollowers: number;
  /** Follower, die wegen dieses Posts entfolgt sind. */
  unfollows: number;
}

/** Woher das Bild eines Beitrags kommt. */
export type PhotoSource = 'generated' | 'upload' | 'stock';

export interface Post {
  id: string;
  authorId: string;
  createdAt: number;
  niche: NicheId;
  topic: string;
  style: StyleId;
  caption: string;
  hashtags: string[];
  imageSeed: number;
  /** Gezeichnet, selbst hochgeladen oder echtes Foto aus dem Netz. */
  photoSource: PhotoSource;
  /** Id des gespeicherten Fotos (bei eigenen Aufnahmen). */
  photoId?: string;
  /** Intrinsische Qualitaet 0..1 - das Herz der Reichweitenberechnung. */
  quality: number;
  /** Aktuelle Algorithmus-Bewertung 0..~2, entwickelt sich mit dem Engagement. */
  algoScore: number;
  metrics: PostMetrics;
  /** Namentlich bekannte Likes (fuer "Gefaellt X und 1.203 weiteren"). */
  likedBy: string[];
  commentList: Comment[];
  /** Markierter Kollaborations-Account. */
  collabId?: string;
  /** Verbleibende Verstaerkung durch den Algorithmus. */
  energy: number;
  /** Aktuelle Explore-Auslieferung pro Stunde (Verzweigungsprozess). */
  spreadRate?: number;
  /** Zufaelliges Glueck dieses Posts - der unberechenbare Rest des Algorithmus. */
  luck: number;
  /** Zahlen-Seed fuer die Engine (schneller als Hashing der Id). */
  seedNum: number;
  /** Ausgespielt und abgeschlossen - wird nicht mehr berechnet. */
  done?: boolean;
  /** Letzte Verarbeitung durch die Engine. */
  lastTick: number;
  /** Vom Nutzer erstellt? */
  byUser: boolean;
  /** Analyse-Aufschluesselung fuer Nutzerposts. */
  breakdown?: QualityBreakdown;
  /** Verhindert, dass die Viral-Meldung mehrfach ausgeloest wird. */
  viralNotified?: boolean;
}

export interface QualityBreakdown {
  motiv: number;
  stil: number;
  caption: number;
  hashtags: number;
  timing: number;
  konsistenz: number;
  nische: number;
  kollab: number;
  total: number;
  hints: string[];
}

export interface HistoryPoint {
  t: number;
  followers: number;
}

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'milestone'
  | 'viral'
  | 'system'
  | 'story';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  at: number;
  actorId?: string;
  postId?: string;
  text: string;
  read: boolean;
  /** Anzahl weiterer Akteure bei gebuendelten Meldungen. */
  others?: number;
}

export type DmKind = 'fan' | 'brand' | 'collab' | 'hater' | 'friend' | 'agency';

export interface DmMessage {
  id: string;
  fromId: string;
  text: string;
  at: number;
  fromUser: boolean;
  /** Antwortmoeglichkeiten fuer den Nutzer. */
  options?: DmOption[];
  optionTaken?: string;
  /** Gespraechsnotiz statt Textnachricht. */
  call?: { seconds: number; missed: boolean; video: boolean };
}

export interface DmOption {
  id: string;
  label: string;
  /** Konsequenz der Antwort. */
  effect: 'accept' | 'decline' | 'neutral';
  reply: string;
  followers?: number;
  money?: number;
  reputation?: number;
}

export interface DmThread {
  id: string;
  accountId: string;
  kind: DmKind;
  messages: DmMessage[];
  unread: boolean;
  lastAt: number;
  /** Reale Uhrzeit (ms), zu der die Antwort eintrifft - 0 heisst: keine offen. */
  replyAtReal?: number;
  /** Text, der dann gesendet wird. */
  pendingReply?: string;
}

export interface Trend {
  tag: string;
  niche: NicheId;
  /** 0..1 - wie stark der Algorithmus den Tag gerade puscht. */
  heat: number;
  startedAt: number;
  duration: number;
  posts: number;
}

export interface UserState {
  accountId: string;
  /** Verdientes Geld aus Kooperationen. */
  money: number;
  /** Ruf bei Marken 0..1. */
  reputation: number;
  savedPosts: string[];
  likedPosts: string[];
  /** Posts, auf die der Nutzer kommentiert hat. */
  commentedPosts: string[];
  seenStories: string[];
  deals: Deal[];
  /** Tage in Folge mit Post. */
  bestStreak: number;
  /**
   * Naehe zu einzelnen Accounts (0..1). Waechst durch Unterhaltungen und
   * Anrufe und macht diese Accounts im eigenen Umfeld praesenter.
   */
  closeness: Record<string, number>;
}

export interface Deal {
  id: string;
  brand: string;
  amount: number;
  at: number;
  accepted: boolean;
}

export interface WorldSettings {
  /** Simulierte Minuten pro realer Sekunde. */
  speed: number;
  paused: boolean;
  /** Gesamtnutzerzahl der fiktiven Plattform. */
  population: number;
  /** Echte Fotos fuer die KI-Accounts laden (braucht Internet). */
  stockPhotos: boolean;
  /**
   * Ansichten pro Tag, die die Plattform der simulierten Creator-Szene
   * insgesamt zuteilt. Wird beim Erzeugen der Welt am Startzustand
   * kalibriert, damit jede Welt fair beginnt.
   */
  attentionCapacity: number;
}

export interface World {
  version: number;
  seed: number;
  /** Simulationszeit in Minuten seit Weltstart. */
  time: number;
  /** Reale Zeit (ms) des letzten Ticks - fuer Offline-Nachholen. */
  realTime: number;
  accounts: Record<string, Account>;
  posts: Record<string, Post>;
  order: string[];
  /**
   * Beitraege, die der Algorithmus gerade noch ausspielt. Nur diese werden
   * pro Schritt berechnet - ohne das waechst der Aufwand mit jedem Tag.
   */
  active: string[];
  notifications: AppNotification[];
  threads: Record<string, DmThread>;
  threadOrder: string[];
  trends: Trend[];
  user: UserState;
  settings: WorldSettings;
  /** Laufender Zaehler fuer eindeutige Ids. */
  counter: number;
  /** Events fuer das Aktivitaets-Log. */
  log: LogEntry[];
  /** Laufzeit-Index Nische -> Account-Ids. Wird beim Laden neu aufgebaut. */
  nicheIndex?: Partial<Record<NicheId, string[]>>;
  /**
   * Aufmerksamkeit ist endlich: Die Plattform kann pro Tag nur eine begrenzte
   * Zahl an Ansichten ausliefern. Wenn alle Accounts wachsen, bekommt jeder
   * einzelne weniger ab - Reichweite ist ein Nullsummenspiel.
   */
  attention: {
    /** Nachfrage des laufenden Schritts. */
    demand: number;
    /** Geglaettete Nachfrage pro Tag. */
    rate: number;
    /** Aktueller Daempfungsfaktor 0..1. */
    factor: number;
  };
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  kind: 'post' | 'growth' | 'social' | 'world';
}
