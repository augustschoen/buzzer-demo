# BUZZER — Projekt-Notizen (Übergabe)

Stand: 7. Juli 2026. Dieses Dokument macht jeden (Mensch oder KI-Assistent) arbeitsfähig,
der das Projekt übernimmt. Technisches Setup: siehe `README.md`.

## Idee

Buzzer mit festen Einsätzen (1 € bis 20.000 €). Alle setzen ein, Timer läuft ab, GO —
der schnellste Tap gewinnt den Pot. Zielmarkt USA. Fairness-Kern: Die Reaktionszeit wird
**lokal auf dem Gerät** gemessen (GO-Anzeige → Tap, Mikrosekunden) und nur die Zahl zentral
verglichen — Internetqualität ist damit egal. Zufalls-Verzögerung nach dem Countdown plus
Fehlstart-Disqualifikation verhindern Vorab-Tippen.

## Design-Regeln (von August festgelegt, strikt einhalten)

- Reines Schwarz `#000`, eckige Kanten (border-radius 0 — Ausnahme: der runde Buzzer, Switches)
- Hairline-Rahmen statt gefüllter/transparenter Boxen, keine Glows/Neon — matt:
  Violett `#8A6FD1`, Gold `#D6B36A` (alles was Geld ist), Rot `#CE4A54`, Grün `#4FA97C`
- Geldbeträge = nackte Goldzahl, keine Chips/Badges
- **So wenig Text wie möglich.** Keine Erklärseiten, keine langen Hinweise — die App ist
  selbsterklärend. Detail-Infos höchstens als kleines ℹ️-Popover am Ort des Geschehens.
- Rot = zu/Stopp, Grün = offen/GO (Ampel-Logik). GO-Screen ist grün.
- Live-Geld-Feed prominent auf der Startseite (Menü) — das ist der Hook.

## Modi (alle gebaut)

- **Klassisch:** 19 Buzzer (1,3,5,10,20,50,75,100,200–1000, 10K, 20K), gestaffelt, Demo-Tempo
  alle 4 min (Profil-Toggle: 30 min). Karten-Grid + zwei „Next up"-Anzeigen (oben: Spektakel,
  auch wenn zu; unten kleine grüne Karte: nächster Buzzer, bei dem man noch reinkommt).
- **Random:** 6 Pools (1/5/10/20/50/100 €), GO kommt zufällig im 3-min-Fenster.
  **Niemals Countdown/Zeit anzeigen** (sonst Timing ableitbar) — Pause zeigt nur
  „Zur Zeit nicht verfügbar". Einsatz → sofort Bereitschafts-Overlay, jeder Tap vor GO = Fehlstart.
- **Jackpot:** täglich 20:15 lokal, 10 € Einsatz, Pot wächst den ganzen Tag, Gold-Optik.
- **Privat:** Einsatz wählen ODER Code in der App eingeben zum Beitreten. Einsatz wird erst
  beim START eingezogen → **Lobby bleibt nach der Runde bestehen, beliebig viele Runden** ohne
  neuen Code. Ersteller drückt START → Timer 30 s bis 0 → dann 2–5 s Zufall bis GO (geheimer
  Server-Jitter). **Für immer 0 % Gebühr.** Nur online (grüner Punkt); offline: Hinweis „Verbindung nötig".
- **Timer-Regel (alle Buzzer außer Random):** sichtbarer Countdown läuft bis 0, DANN 2–5 s
  Zufall bis grün. Angezeigt wird immer bis `tGoBase` (fest), grün = `tGoBase + 2–5 s` (verdeckt),
  damit das GO-Timing nicht ablesbar ist. Random: gar kein Countdown.
- **Bestenlisten** (Pokal-Icon im Header): Schnellste heute + Top-Gewinner heute, eigene
  Platzierung markiert, täglicher Reset.
- Benachrichtigungen (Profil-Toggle): lokal, nur solange App im Hintergrund offen ist.

## Geld-Entscheidungen

- **Profil zeigt nie Verluste auf den ersten Blick** (Augusts Entscheidung 08.07.): Statt „Bilanz"
  (konnte rot/negativ sein) steht dort „Gewonnen" (Brutto-Gewinne, gold). Verluste sieht man nur
  bewusst unter Profil → „Vergangene Runden" (Liste: Datum, Buzzer, Reaktionszeit, +Gewinn/−Einsatz).
- **Zeitgleichheit teilt den Pot** (Server, 08.07.): Exakt gleiche Reaktionszeiten teilen sich den
  Preis ihres Rangs (WTA und Top-3) — verhindert Doppel-Auszahlung. Gerechnet wird intern mit
  voller Float-Präzision (Sub-Millisekunde), angezeigt werden 2 Nachkommastellen.

- Demo/Phase 1: **0 % Gebühr überall**, kein echtes Geld, „Aufladen" ist Attrappe
  (Apple Pay/PayPal/venmo/Mastercard nur Optik).
- Gebühr wird im Produkt **niemals kommuniziert** (keine Gebühren-Texte in der UI).
- Offene Business-Entscheidung: Rake auf öffentliche Buzzer (Empfehlung ~5 %,
  Augusts Impuls 0,5 % — deckt keine Zahlungskosten). Privat bleibt 0 %.
- Auszahlung: Winner-takes-all; bei 200–1000 € Top 3 (60/25/15) — finale Wahl offen, ℹ️ pro
  Buzzer zeigt die Aufteilung live in €.

## Architektur Phase 1 (fertig, getestet)

- `index.html`: komplette App. Erkennt Server (same-origin `/ws`, überschreibbar `?srv=host`).
  Offline: deterministische Simulation (Bots, seeded). Online: Server = Kasse
  (Guthaben/Einsätze/Taps/Ergebnisse), Uhr synchronisiert, grüner Punkt im Header.
- `server/server.js`: identische deterministische Engine (Lockstep), echte private Lobbys
  (`?join=CODE`-Deep-Link), Konten per Token, Persistenz `server/data.json`.
- Bewiesen: zwei getrennte Clients in einer Lobby, GO an beide, zentrale Wertung, korrekte
  Auszahlung, Guthaben überlebt Reload.

## Kollisions-Regeln (16.07.)

- **Privat-START gesperrt**, wenn der Ersteller einen laufenden öffentlichen Einsatz mit GO in
  <45 s hat (Client-Toast + Server lehnt mit `busy` ab).
- **Öffentliche Einsätze gesperrt**, solange die eigene private Runde gestartet ist (startAt gesetzt).
- **Ergebnis-Screen weicht automatisch** dem Countdown der nächsten eigenen Runde (checkTakeover
  löst bei `state==="result"` ab); private Live-Runde (PV.active) wird nie überdeckt.

## Guthaben-Persistenz (wichtig!)

- Render Free-Tier hat **flüchtigen Speicher**: `server/data.json` (Konten+Guthaben) wird bei
  JEDEM Neustart/Deploy/Spin-down gelöscht → ohne Gegenmaßnahme fällt jeder auf 500 € zurück.
- **Interim-Fix (08.07.):** Der Client schickt beim Verbinden sein zuletzt bekanntes Guthaben mit
  (`restore`). Kennt der Server den Token nicht mehr (Daten weg), stellt er dieses Guthaben wieder
  her statt 500. → Auf demselben Gerät bleibt das Guthaben erhalten. Gedeckelt auf 100.000
  (Spielgeld). Nachteil: clientseitig manipulierbar + kein Sync über mehrere Geräte.
- **Echte Lösung (Phase 2/3):** persistente DB (Postgres/Redis, z. B. Neon/Supabase/Render-Paid).
  Erst damit ist es fälschungssicher und geräteübergreifend — Pflicht für Echtgeld.
- Green-Fenster: `GREEN_MS=4500` (Client+Server müssen übereinstimmen). Private Runde ohne
  gültigen Tipp = `voided` → alle bekommen Einsatz zurück (kein verschwundenes Geld).

## Bekannte Grenzen / bewusste Attrappen

- E-Mail-Code: serverseitig erzeugt & geprüft; **echter Versand sobald `server/mail-config.json`
  mit Brevo-/Resend-Key existiert** (siehe README), sonst Demo-Fallback (Code wird angezeigt).
  Verifizierte E-Mail wird am Server-Konto gespeichert. **Alters-/Ausweis-Check ist Attrappe und
  bleibt vorerst so** (Augusts Entscheidung 07.07.2026 — echt erst mit KYC-Anbieter in Phase 3).
- Öffentliche Buzzer: GO-Jitter ist seeded und clientseitig berechenbar → für Techniker
  vorhersagbar. Fix (Phase 1.1): geheimer Server-Jitter wie bei Privat.
- Push aufs gesperrte Handy: erst mit nativer App/echtem Push-Dienst.
- Tunnel-Hosting (trycloudflare) ist temporär — PC muss laufen, URL wechselt.

## Installierbare App (Stand 08.07.)

- App ist eine **PWA**: manifest.webmanifest + sw.js (Netz zuerst — immer neueste Version,
  Cache nur Offline-Fallback) + icons/ (matter violetter Buzzer, Gold-Ring, schwarz).
  Installierbar: Desktop Win/Mac (Chrome/Edge Adressleisten-Icon „Installieren"),
  Android (Chrome-Hinweis „App installieren"), iPhone (Teilen → Zum Home-Bildschirm).
- **Crypto-Einzahlung ändert die Rechtslage NICHT** (Augusts Frage 08.07.): Einsatz um
  Vermögenswerte = Glücksspielrecht, egal ob € oder Coin; Crypto-Casinos laufen über
  Offshore-Lizenzen (Curaçao etc.) — genau das strukturiert der Gaming-Anwalt in Phase 3.
  Echtgeld (auch Crypto) erst nach Firma + Anwalt + Lizenz/PSP.
- **App Store / Play Store**: Weg = Capacitor-Hülle um dieselbe App (+echte Pushes).
  Benötigt von August: Apple Developer Account (99 $/Jahr) + Mac oder Cloud-Build
  (Codemagic); Google Play Console (25 $ einmalig, Build geht von Windows).

## Roadmap

1. **Hosting-Entscheidung** (offen): Render/Railway/Fly/VPS mit Augusts Account → fester Link.
2. Phase 1.1: Server-Jitter für alle Modi, öffentliche Runden-Ergebnisliste, Reconnect-Feinschliff.
3. Phase 2: Domain + Name (offen! „BUZZER" evtl. vergeben), Icon/Splash, Impressum/AGB,
   native Hülle (TestFlight), echte E-Mail-Verifikation.
4. Phase 3 (Echtgeld, nur mit Anwalt): US-Skill-Gaming-Route, Firma, KYC (Persona/Jumio),
   Gaming-PSP (Nuvei/Worldpay — Standard-PayPal/Stripe verbieten Real-Money-Gaming),
   Geo-Fencing, Responsible Gaming.

## Offene Fragen an August

- Name der App (BUZZER = Arbeitstitel)
- Buzzer-Leiter: „100k" im ersten Briefing Tippfehler für 10k? (aktuell 10K + 20K)
- Rake-Höhe öffentliche Buzzer / finale Auszahlungs-Modi
- Frequenz-Staffelung (kleine Buzzer öfter, große seltener) — empfohlen, nicht umgesetzt
- Hosting-Wahl (Render empfohlen)

## Konten & Zugänge

- GitHub-Repo unter `august-schoen` — **prüfen, dass August diesen GitHub-Zugang behält**,
  wenn er Rechner/Claude-Konto wechselt; sonst Repo vorher auf privaten Account übertragen.
- Claude-Artifact-Link ist an das jeweilige Claude-Konto gebunden — nicht als Speicher verlassen,
  das Repo ist die Quelle der Wahrheit.
