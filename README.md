# Fotogram

Ein voll funktionsfähiges Foto-Netzwerk im Stil von Instagram – inklusive einer
Welt aus **220 eigenständigen KI-Accounts**, die posten, einander folgen,
kommentieren, wachsen, stagnieren oder berühmt werden. Du startest bei null
Followern und versuchst, dich zwischen ihnen durchzusetzen.

Alles läuft lokal im Browser: kein Server, kein Account, keine API-Schlüssel.
Auch die Bilder entstehen im Browser – jeder Beitrag wird prozedural aus seinem
Seed gezeichnet und sieht nach dem Neuladen exakt gleich aus.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
```

```bash
npm run build    # Produktionsbuild nach dist/
npm run preview  # Build lokal ausliefern
npm test         # 30 Tests zur Simulationslogik
```

## Was die App kann

| Bereich | Inhalt |
| --- | --- |
| **Feed** | Beiträge abonnierter Accounts, gemischt mit algorithmischen Empfehlungen, Stories, Likes, Kommentare, Speichern |
| **Erstellen** | Motiv, Bildstil, Bildunterschrift, Hashtags, Kollaboration – mit Live-Analyse und konkreten Verbesserungstipps |
| **Entdecken** | Explore-Raster, Suche nach Accounts und Hashtags, Trend-Hashtags, Rangliste der Szene |
| **Profile** | Eigenes und fremde Profile, Beitragsraster, Followerverlauf, Follower-/Abo-Listen, Profil bearbeiten |
| **Aktivitäten** | Likes, Kommentare, neue Follower, Meilensteine, Viral-Meldungen |
| **Nachrichten** | Fans, Kooperationsanfragen von Marken (mit Verhandeln/Ablehnen), Kollaborationen, Agenturen, Hater |
| **Statistiken** | Followerentwicklung, Reichweite, Interaktionsrate, beste Uhrzeiten, welche Motive bei deinem Publikum wirken, Tabelle aller Beiträge |
| **Simulation** | Uhrzeit, Pause und vier Geschwindigkeiten; die Welt läuft weiter, während du weg bist |

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
    world.ts          Welterzeugung inkl. 14 Tagen simulierter Vorgeschichte
    store.ts          Echtzeitschleife und React-Anbindung
    persistence.ts    Speichern im Browser (mit Notfall-Verkleinerung)
  ui/                 Ansichten und Komponenten
```

Eine neue Welt wird aus einem Seed erzeugt und anschließend 14 simulierte Tage
lang durchgerechnet, bevor du sie betrittst – die Accounts haben also bereits
eine Geschichte, Follower und Beiträge, wenn du dich anmeldest.

## Spielstand

Der Stand liegt im `localStorage` des Browsers und wird alle acht Sekunden sowie
beim Schließen gespeichert. Warst du weg, holt die Simulation die verstrichene
Zeit beim nächsten Öffnen nach (maximal drei simulierte Tage). Unter
*Einstellungen* lässt sich neu anfangen.

## Hinweis

Alle Accounts, Bilder, Kommentare und Nachrichten sind erfunden und werden
lokal erzeugt. Es gibt keine echten Personen, keine Server und keine
Datenübertragung.
