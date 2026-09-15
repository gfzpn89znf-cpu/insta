# Fotogram

Ein voll funktionsfähiges Foto-Netzwerk im Stil von Instagram – inklusive einer
Welt aus **220 eigenständigen KI-Accounts**, die posten, einander folgen,
kommentieren, chatten, telefonieren, wachsen, stagnieren oder berühmt werden.
Du startest bei null Followern und versuchst, dich zwischen ihnen durchzusetzen.

Fotogram ist eine **installierbare App**: auf dem Handy landet sie mit eigenem
Icon neben den anderen Apps, startet im Vollbild und funktioniert auch ohne
Internet. Die Simulation läuft vollständig auf dem Gerät – kein Server, kein
Konto, keine API-Schlüssel.

## Auf dem Handy installieren

**https://gfzpn89znf-cpu.github.io/insta/**

1. Diese Adresse im Browser des Handys öffnen.
2. **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm".
   **Android (Chrome):** Menü ⋮ → „App installieren" – oder in Fotogram unter
   *Einstellungen → App → Fotogram installieren*.
3. Fertig: eigenes Icon, Vollbild, kein Browser-Rahmen.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
```

```bash
npm run build         # Produktionsbuild nach dist/
npm run preview       # Build lokal ausliefern
npm test              # 30 Tests zur Simulationslogik
npm run build:single  # alles in eine eigenstaendige HTML-Datei buendeln
```

## Was die App kann

| Bereich | Inhalt |
| --- | --- |
| **Feed** | Beiträge abonnierter Accounts, gemischt mit algorithmischen Empfehlungen, Stories, Likes, Kommentare, Speichern |
| **Erstellen** | Eigene Fotos und Videos aus Galerie oder Kamera, sonst ein gezeichnetes Motiv; dazu Thema, Bildunterschrift, Hashtags, Kollaboration – mit Live-Analyse und konkreten Verbesserungstipps |
| **Reels** | Senkrechter Videobereich zum Durchscrollen. Eigene Videos laufen als echtes Video, KI-Beiträge als bewegter Clip. Video wird vom Algorithmus spürbar breiter ausgespielt |
| **Nachrichten** | Freie Unterhaltungen mit jedem Account. Die Antworten richten sich nach Persönlichkeit, Reichweite und eurer bisherigen Nähe – und kommen mit Verzögerung |
| **Anrufe** | Sprach- und Videoanrufe mit Klingeln, Annehmen, Gesprächsdauer und gesprochenen Antworten. Nicht jeder geht ran: nachts, bei sehr großen Accounts oder wenig Nähe klingelt es vergeblich |
| **Entdecken** | Explore-Raster, Suche nach Accounts und Hashtags, Trend-Hashtags, Rangliste der Szene |
| **Profile** | Eigenes und fremde Profile, Beitragsraster, Followerverlauf, Follower-/Abo-Listen, Profil bearbeiten |
| **Aktivitäten** | Likes, Kommentare, neue Follower, Meilensteine, Viral-Meldungen |
| **Kooperationen** | Anfragen von Marken (mit Verhandeln/Ablehnen), Kollaborationen, Agenturen, Fans und Hater – jeweils mit Folgen für Follower, Einnahmen und Ruf |
| **Statistiken** | Followerentwicklung, Reichweite, Interaktionsrate, beste Uhrzeiten, welche Motive bei deinem Publikum wirken, Tabelle aller Beiträge |
| **Simulation** | Uhrzeit, Pause und vier Geschwindigkeiten; die Welt läuft weiter, während du weg bist |
| **Navigation** | Jeder Unterbildschirm hat einen Zurück-Pfeil, und die Zurück-Geste des Handys führt denselben Weg zurück |

## Wie die Simulation funktioniert

Die Reichweite eines Beitrags ist kein Zufallswert, sondern das Ergebnis eines
Modells, das dem Verhalten echter Empfehlungssysteme nachempfunden ist.

**1. Kaltstart.** Jeder Beitrag wird zuerst an einer kleinen Testgruppe
ausgespielt. Kleine Accounts bekommen relativ gesehen die größte Testgruppe –
nur deshalb kann ein unbekannter Account überhaupt durchbrechen.

**2. Messung.** Der Algorithmus misst die Interaktionsrate gegen den
Plattformschnitt von 5 %.

**3. Verbreitung als Verzweigungsprozess.** Aus dem Verhältnis „gemessene zu
erwarteter Interaktionsrate" entsteht eine Reproduktionszahl *R*: Liegt sie
unter 1, versandet der Beitrag; liegt sie darüber, wächst die Auslieferung
Stunde um Stunde – ein Beitrag geht viral. *R* sinkt mit dem Alter des Beitrags
und mit der Sättigung der Nische, deshalb endet jede Welle von selbst.

**4. Follower.** Nur kalte Reichweite (Explore) bringt neue Follower. Wie viele,
hängt davon ab, wie überzeugend dein Profil auf Besucher wirkt: thematische
Konsequenz, Qualität der letzten Beiträge, Biografie, Größe.

**5. Aufmerksamkeit ist endlich.** Die Plattform kann pro Tag nur eine
begrenzte Zahl an Ansichten ausliefern. Wächst die gesamte Szene, bekommt jeder
Einzelne weniger ab. Reichweite ist damit ein Verdrängungswettbewerb und die
Welt inflationiert nicht.

Dazu kommen: natürliche Abwanderung (jeder Account verliert ständig Follower),
Entfolgen nach Themenwechseln, Trend-Hashtags, die entstehen und verglühen,
sowie das persönliche Glück eines Beitrags – der unberechenbare Rest, den es
real auch gibt.

### Was einen Beitrag stark macht

Der Composer bewertet jeden Entwurf vor der Veröffentlichung in sieben
Dimensionen (`src/sim/scoring.ts`):

- **Motiv** – Themen mit breiter Anschlussfähigkeit erreichen auch Menschen
  außerhalb deiner Nische, Nischenthemen binden dafür dein Stammpublikum.
- **Text** – Länge zwischen 40 und 220 Zeichen, ein Hook in der ersten Zeile,
  eine Frage oder ein Aufruf, persönliche Details. Großbuchstaben, Ausrufezeichen-
  Ketten und Follower-Bettelei kosten Punkte.
- **Hashtags** – 3 bis 12 relevante Tags, aktuelle Trends als Verstärker,
  Spam-Tags als Bremse.
- **Bildstil** – manche Stile passen optisch zur Nische, andere nicht.
- **Zeitpunkt** – morgens, mittags, abends ist dein Publikum online, nachts nicht.
- **Regelmäßigkeit** – Serien halten den Account warm, lange Pausen setzen dich
  zurück, zwei Beiträge kurz hintereinander nehmen sich gegenseitig Reichweite.
- **Nischentreue** – dein Publikum folgt dir wegen eines Themas.

Kommentieren wirkt zusätzlich: Wer früh unter reichweitenstarken Beiträgen
sichtbar ist, wird selbst entdeckt – der wirksamste kostenlose Wachstumshebel.

### Größenordnungen

Gemessen über die Kalibrierungsläufe in `src/sim/__tests__/sim.test.ts`:

| Spielweise | nach 30 Tagen | nach 90 Tagen |
| --- | --- | --- |
| Täglich durchdachte Beiträge | ca. 9.000 Follower | ca. 200.000 Follower |
| Lieblose Beiträge, Hashtag-Spam | ca. 340 Follower | ca. 1.300 Follower |

Ab 1.000 Followern melden sich Marken, ab 100.000 gibt es das blaue Häkchen.

## Echte KI (optional)

Ohne Einrichtung schreiben die Accounts aus vorbereiteten Bausteinen – das
funktioniert offline, kostet nichts und erkennt inzwischen auch direkte Fragen
(„Wie heißt du?" bekommt den Namen zur Antwort).

Mit einem eigenen API-Schlüssel von Anthropic (*Einstellungen → Künstliche
Intelligenz*) übernimmt ein Claude-Modell:

- **Bilderkennung** – lädst du ein Foto oder Video hoch, schaut sich das Modell
  die Aufnahme an (bei Videos ein Einzelbild aus der Mitte), erkennt das Thema
  und schlägt Hashtags und eine Bildunterschrift vor. Die Kommentare gehen
  danach auf das ein, was wirklich zu sehen ist.

- **Unterhaltungen** – jede Antwort wird neu formuliert, passend zu Charakter,
  Reichweite, Tageszeit und eurer bisherigen Nähe.
- **Anrufe** – du sprichst (Spracherkennung des Browsers), die Person antwortet
  und wird vorgelesen. Ohne Mikrofon gibt es ein Textfeld.
- **Bildunterschriften** – jeder Account textet in seinem eigenen Ton.
- **Kommentare** – unterschiedlich lang, mal begeistert, mal gleichgültig; und
  Autoren antworten auf deine Kommentare.

Der Schlüssel liegt ausschließlich im Browser des Geräts und geht nur an
Anthropic – Fotogram hat keinen Server, der ihn sehen könnte. Ein Tagesbudget
begrenzt die Anfragen; ist es aufgebraucht oder scheitert eine Anfrage,
übernehmen sofort wieder die Bausteine. Anfragen entstehen nur für Inhalte, die
du tatsächlich siehst.

Das SDK wird als eigenes Bündel geladen und nur dann, wenn ein Schlüssel
hinterlegt ist – ohne KI bleibt die App genauso schlank wie vorher.

## Fotos und Videos

Es gibt mehrere Quellen, und die App fällt automatisch auf die nächste zurück:

1. **Eigene Aufnahmen** – Fotos aus Galerie oder Kamera werden auf maximal
   1280 Pixel verkleinert und als JPEG gespeichert; Videos bis 60 MB landen
   unverändert in IndexedDB. Auch das Profilbild lässt sich so setzen.
2. **Echte Fotos und Videos für die KI-Accounts** – gesucht wird in der
   Volltextsuche von Wikimedia Commons, mit richtigen Stichworten je Motiv
   („meal prep food containers" statt eines Schlagwort-Kürzels). Zufallsdienste
   liefern zu einem Kürzel schon mal eine Getreideernte; eine Suche tut das
   nicht. Jede Suche wird dauerhaft gespeichert und läuft nur einmal.
   Unter *Einstellungen → Fotos → Bildquellen prüfen* lässt sich direkt
   nachsehen, was zu einem Motiv gefunden wird.
3. **Portraits** – KI-Accounts haben echte Gesichter als Profilbild, passend zum
   Vornamen und fest pro Account.
4. **Gezeichnete Motive** – prozedural aus dem Seed erzeugt. Sie greifen, wenn
   kein Internet da ist oder ein Dienst nicht antwortet, und sehen nach dem
   Neuladen exakt gleich aus.

Alles aus dem Netz lässt sich unter *Einstellungen → Fotos* abschalten.

## Veröffentlichen

Ein Push baut die App, lässt die Tests laufen und veröffentlicht sie über
GitHub Pages – siehe `.github/workflows/deploy.yml`.

**Einmalig nötig:** GitHub Pages im Repository einschalten unter
*Settings → Pages → Build and deployment → Source: **GitHub Actions***. Der
Workflow versucht das selbst, darf es aber mit seinen Rechten nicht. Danach den
Lauf wiederholen (*Actions → letzter Lauf → Re-run all jobs*).

Die Adresse lautet anschließend `https://<benutzer>.github.io/<repository>/` –
für dieses Repository also **https://gfzpn89znf-cpu.github.io/insta/**.

Zu beachten: GitHub veröffentlicht standardmäßig nur aus dem Hauptzweig `main`.
Wer aus einem Entwicklungszweig veröffentlichen will, muss diesen unter
*Settings → Environments → github-pages → Deployment branches* zusätzlich
erlauben.

## Aufbau des Codes

```
src/
  sim/                Simulation, vollständig ohne UI-Abhängigkeiten
    rng.ts            Deterministischer Zufall (Mulberry32, Potenzgesetz, Gauß)
    types.ts          Datenmodell
    niches.ts         16 Nischen mit Themen, Hashtags, Captions, Kommentaren
    names.ts          Namen, Handles, Biografien
    content.ts        Texterzeugung und Zahlenformatierung
    scoring.ts        Bewertung von Beitragsentwürfen
    posts.ts          Beitragserstellung
    engine.ts         Herzstück: Reichweite, Engagement, Wachstum, Trends
    dms.ts            Kooperationsanfragen und ihre Folgen
    feed.ts           Feed-, Explore- und Ranking-Algorithmen
    actions.ts        Nutzeraktionen mit ihren Konsequenzen
    image.ts          Prozedurale Bild- und Avatarerzeugung auf Canvas
    photos.ts         Eigene Fotos verkleinern und speichern, Fotoquellen fuer KI
    db.ts             IndexedDB: Spielstand und Fotos
    ai.ts             Anbindung an Claude (Schluessel, Budget, Fehlerbehandlung)
    persona.ts        Beschreibt einen Account so, dass die KI ihn spielen kann
    aiContent.ts      Bildunterschriften und Kommentare von der KI
    media.ts          Mediensuche bei Wikimedia Commons, mit Zwischenspeicher
    vision.ts         Erkennt, was auf einer hochgeladenen Aufnahme zu sehen ist
    chat.ts           Unterhaltungen und Antwortlogik
    calls.ts          Anrufe: wer rangeht und was gesagt wird
    world.ts          Welterzeugung inkl. simulierter Vorgeschichte, in Haeppchen
    store.ts          Echtzeitschleife und React-Anbindung
    persistence.ts    Speichern im Browser (mit Notfall-Verkleinerung)
  ui/                 Ansichten und Komponenten
    nav.ts            Ansichtsstapel, gekoppelt an die Browser-Historie
    Media.tsx         Fotos, Videos, gezeichnete Bilder und Avatare an einer Stelle
    Reels.tsx         Senkrechter Videobereich
    Call.tsx          Anrufbildschirm mit Spracheingabe und -ausgabe
public/
  manifest.webmanifest, sw.js, icons/   Alles, was die App installierbar macht
```

Eine neue Welt wird aus einem Seed erzeugt und anschließend 7 simulierte Tage lang
durchgerechnet, bevor du sie betrittst – die Accounts haben also bereits
eine Geschichte, Follower und Beiträge, wenn du dich anmeldest.

## Ladezeit

Die App startet in unter einer Sekunde; danach rechnet sie die Vorgeschichte
der Szene durch – auf einem schnellen Gerät knapp eine Sekunde, auf einem
langsamen Telefon wenige Sekunden. Dafür sorgen drei Dinge:

- Der Weltaufbau läuft in Häppchen von sechs Simulationsstunden, zwischen denen
  der Browser zeichnen kann. Deshalb siehst du einen echten Fortschrittsbalken
  statt einer eingefrorenen Seite.
- Die Engine rechnet nur Beiträge weiter, die der Algorithmus noch ausspielt.
  Ein Beitrag, bei dem nichts mehr nachkommt, wird abgeschlossen und fällt aus
  der Schleife – das spart rund zwei Drittel der Rechenzeit.
- Bilder werden erst gezeichnet, wenn sie in die Nähe des Sichtbereichs kommen,
  und die Filmkörnung kommt aus einer einmal erzeugten Textur statt aus einer
  Pixelschleife pro Bild.

## Spielstand

Der Stand liegt in der IndexedDB des Browsers – dort ist genug Platz für Fotos –
und wird regelmäßig sowie beim Schließen gespeichert. Ältere Stände aus dem
`localStorage` werden beim ersten Start automatisch übernommen. Warst du weg, holt die Simulation die verstrichene
Zeit beim nächsten Öffnen nach (maximal drei simulierte Tage). Unter
*Einstellungen* lässt sich neu anfangen.

## Hinweis

Alle Accounts, Bilder, Kommentare und Nachrichten sind erfunden und werden
lokal erzeugt. Es gibt keine echten Personen, keine Server und keine
Datenübertragung.
