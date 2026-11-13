# kortform-liga-web

Einladungsseite und Verfügbarkeitsseite unter `https://liga.kortform.at` für „Liga teilen“ (Kort-ID) und die
Verfügbarkeit je Saison in der Kortform-App. Statische Seite auf GitHub Pages, ohne Cookies, ohne Tracker, `noindex`.
Gehört zum Plan `docs/plans/kort-id-plan.md` im App-Repo `itn-rechner`.

## Was die Seite tut

- `/t/<token>` (Prod) und `/d/<token>` (Dev): GitHub Pages liefert dafür `404.html` aus. Die Seite liest Präfix und Token,
  fragt die öffentliche RPC `get_invite_preview` des passenden Supabase-Projekts ab und zeigt Mannschaft und Liga bzw. eine
  Meldung für abgelaufene, benutzte, zurückgezogene oder unbekannte Einladungen. Dazu ein Banner „In der App öffnen“
  (`kortform://invite/<token>` für `/t/`, `kortform-dev://invite/<token>` für `/d/`) und die Store-Buttons.
- Wenn die App installiert ist, öffnen Android App Links und iOS Universal Links den Link direkt in der App; die Seite
  erscheint nur ohne App.
- `/s/<ID>` (Prod) und `/z/<ID>` (Dev): **Verfügbarkeit je Saison**, siehe unten.
- `/v/<ID>` und `/w/<ID>` (alte Verfügbarkeitsabfrage): statischer Hinweis „Diese Abfrage wurde beendet“ (kein Backend-Aufruf).
- `/` (`index.html`): kurze Erklärung und Link auf kortform.at.
- `/.well-known/assetlinks.json` (Android) und `/.well-known/apple-app-site-association` (iOS).

## Verfügbarkeit je Saison (`/s/<ID>`, `/z/<ID>`)

Antwortseite für Spieler*innen: Link `https://liga.kortform.at/s/<ID>` (Prod) bzw. `/z/<ID>` (Dev), `ID` = 12 Zeichen
`[A-Za-z0-9]` (`public_id` der Saison im Backend `kort-id-backend`, README-Abschnitt „Verfügbarkeit“). Der Link gilt je
Mannschaft und Saison dauerhaft (bis die Saison abläuft oder die Mannschaftsführung den Link erneuert). Die Seite kommt wie die
Einladung über `404.html`; `route.js` (winzig, blockierend) erkennt die Pfade vor dem ersten Rendern und blendet die
Einladungsansicht aus, `season.js` baut die Seite, `season.css` gestaltet sie. `invite.js` tut auf diesen Pfaden nichts.

- **Ablauf:** `get_avail_season(p_public_id, p_person_key)` (anon RPC) liefert Saison, Spieltage, Kader, alle aktuellen
  Antworten und, mit Personenschlüssel, den eigenen Verlauf (`own_history`). Ohne gemerkte Person „Wer bist du?“ (Kader
  alphabetisch, Anzeige „Nachname Vorname“, Suchfeld ab mehr als 10 Personen; ohne Namen „Spieler\*in ohne Namen“, der
  Schlüssel wird nie angezeigt). Danach die Saisonliste.
- **Saisonliste:** chronologisch, nach Monat gruppiert; Datum, Wochentag und Uhrzeit in österreichischer Zeit, Heim/Auswärts,
  Gegner, Adresse (Link auf Google Maps), eigene Antwort als Ja / Vielleicht / Nein, optionaler Kommentar (bis 60 Zeichen,
  speichert beim Verlassen des Feldes), „bestätigt“-Marke, abgesagte Spieltage durchgestrichen und nicht beantwortbar,
  vergangene Spieltage (`starts_at` ≤ Serverzeit) in einem eingeklappten Bereich ohne Eingabe. Je Spieltag klappt
  „Mannschaft“ auf: Zähler und Namen gruppiert nach Ja / Vielleicht / Nein / Offen (die Mannschaft sieht alle Antworten,
  Produktentscheidung) und „Dein Verlauf“ (z. B. „Ja · Web · 2.6. 18:04“, „bestätigt · App · 12.6.“).
- **Erinnerung oben (gleiche Logik wie die App):** Der früheste nicht abgesagte Spieltag mit `starts_at − 14 Tage ≤ jetzt <
  starts_at` (jetzt = Serverzeit aus `server_time`, nicht die Gerätezeit), der „fällig“ ist: keine eigene Antwort → „Du hast
  noch nicht eingetragen, ob du Zeit hast.“ mit Ja / Vielleicht / Nein; Antwort mit `confirmed_at < starts_at − 14 Tage` →
  „Hat sich deine Verfügbarkeit geändert?“ mit „Passt noch“ (`confirm_avail_answer`) und „Ändern“. `n` = ganze Kalendertage
  (Europe/Vienna) bis zum Match, 1 = „morgen“, 0 = „heute“. Sind mehrere fällig, steht „+ n weitere Spieltage fällig“ darunter.
  Ohne fälligen Spieltag ist der Banner weg. Eine Antwort gilt ab dem Zeitpunkt als bestätigt, `confirmed_at ≥ starts_at − 14 Tage`.
- **Schreiben:** `submit_avail_answer` und `confirm_avail_answer` (`p_source: "web"`), nacheinander, die Auswahl erscheint sofort
  und springt bei einem Fehler zurück; danach immer ein neues `get_avail_season`. Antworten sind nur bis zum Anstoß möglich.
- **Fehlercodes:** `season_unknown`/`not_found` → „Diesen Link kennen wir nicht …“; `season_expired`/`expired` → „Diese Saison
  ist zu Ende.“; `avail_paused` → „Eintragen ist gerade nicht möglich.“ (mit „Erneut“); `avail_write_limit` (mit „Erneut“);
  `meeting_closed`, `meeting_cancelled`, `meeting_unknown`, `no_answer` → Hinweis und neu laden; `person_unknown`/`person_removed` →
  Person vergessen, „Wer bist du?“; `invalid_answer` → Hinweis ohne „Erneut“; Netzwerk und alles andere → „Nicht gespeichert –
  erneut versuchen“. Offline (`navigator.onLine`) zeigt den Banner und sperrt alle Eingaben.
- **Lokaler Speicher** (`localStorage`, Schlüssel `kortform.avail.<public_id>`): nur der Personenschlüssel der gewählten
  Person. Alles in try/catch; ohne Speicher funktioniert die Seite, merkt sich aber nichts. „Nicht du? Person wechseln“ löscht
  den Eintrag. Es gibt weder Analytics noch Logging; `public_id` und Personenschlüssel gehen nur in die RPC-Aufrufe.
- **App-Banner:** `kortform://avail/<ID>` (`/s/`) bzw. `kortform-dev://avail/<ID>` (`/z/`); ab 1024 px Kopfzeile mit
  „Google Play“ / „App Store“, rechts die Karte „So funktioniert’s“.
- **Universal/App Links:** `/s/*` (Prod-App) und `/z/*` (Dev-App) stehen in `apple-app-site-association`; `assetlinks.json`
  ist pfadunabhängig und braucht keine Änderung. Die App muss die Pfade als Intent-Filter bzw. Deeplink annehmen.
  **Alte Pfade `/v/*` und `/w/*` stehen nicht mehr in der AASA:** ausgelieferte App-Versionen mit der alten Abfrage öffnen den
  Link dann unter iOS nicht mehr in der App (dort gäbe es nur Fehler, die RPCs sind weg), sondern im Browser mit dem
  Hinweis „Diese Abfrage wurde beendet“ (Apple cached die AASA bis ca. 24 h). Android lässt sich von hier nicht steuern:
  `assetlinks.json` ist pfadunabhängig, die Intent-Filter stecken in der alten App.
- **Keys:** `config.js` ordnet `s` → Prod und `z` → Dev zu (dieselben Einträge wie `t` und `d`, keine neuen Secrets).
  Das CSP (`connect-src` nur die beiden Supabase-Hosts, `script-src 'self'`, `style-src 'self'`) bleibt unverändert; die Seite
  nutzt weder Inline-Skripte noch Inline-Styles.

## Struktur

```
site/
  CNAME                          # liga.kortform.at
  .nojekyll                      # kein Jekyll
  index.html, 404.html           # 404.html = Einladungs-, Verfügbarkeits- und „Abfrage beendet“-Seite (Routing nach Pfad)
  style.css, invite.js           # Layout (hell/dunkel), Einladungslogik
  route.js, season.js, season.css # Verfügbarkeit (/s/<ID>, /z/<ID>), Hinweis für alte Links (/v/<ID>, /w/<ID>)
  config.js                      # Supabase-Ref + publishable Key je Umgebung
  .well-known/                   # assetlinks.json, apple-app-site-association
  fonts/                         # Barlow Condensed, IBM Plex Sans (wie kortform.at)
.github/workflows/pages.yml      # Deploy bei Push auf main (Artefakt inkl. Dotfiles)
```

## Konfiguration pflegen

**Keys (`site/config.js`)**: `t` = Prod (`/t/`), `d` = Dev (`/d/`); `s` und `z` (Verfügbarkeit) zeigen auf dieselben Einträge. Nur Projekt-Ref und der **publishable** Key
(`sb_publishable_…`, öffentlich gedacht). Nie einen Secret- oder Service-Role-Key eintragen. Holen:
`supabase projects api-keys --project-ref <REF>` (nur die Zeile `publishable` übernehmen).
Prod-Ref ist `sjkoqqcpfwegmwzavida` (gesetzt). Ändert sich der Ref, **auch die `connect-src`-Liste im CSP-`<meta>` von
`site/404.html` anpassen** (Host `https://<ref>.supabase.co`), sonst blockiert der Browser die Abfrage.

**Android-Fingerprints (`site/.well-known/assetlinks.json`)**: je App-ID ein Eintrag.
- `com.swordistudios.kortform.dev`: SHA-256 des lokalen Debug-Keystores:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256`
- `com.swordistudios.kortform`: eingetragen ist der SHA-256 des **App-Signing-Keys** aus der Play Console (Test und
  Veröffentlichung → App-Signatur). Der **Upload-Key** (zweiter Fingerprint in der Liste, damit auch lokal signierte
  Builds verifizieren) ist noch nicht ergänzt. Weitere Geräte-Debug-Keystores bei Bedarf als zusätzliche Fingerprints.

**iOS (`site/.well-known/apple-app-site-association`)**: Team-ID `84TKTNMRH2`; Prod-Bundle `com.swordistudios.kortform` mit
Pfaden `/t/*` und `/s/*`, Dev-Bundle `com.swordistudios.kortform.dev` mit `/d/*` und `/z/*`. Die App braucht das Entitlement
`com.apple.developer.associated-domains` mit `applinks:liga.kortform.at` (Prod und Dev).

## DNS und Pages

- World4You: CNAME `liga` → `mgursch.github.io` (macht der Owner in WP4).
- Pages-Quelle ist „GitHub Actions“ (`build_type=workflow`, bereits gesetzt). Die Datei `site/CNAME` reicht für die eigene
  Domain im Workflow-Betrieb nicht allein: Sobald der DNS-Eintrag da ist, im Repo unter Settings → Pages die Custom Domain
  `liga.kortform.at` eintragen (oder `gh api -X PUT repos/mgursch/kortform-liga-web/pages -f cname=liga.kortform.at`)
  und danach „Enforce HTTPS“ aktivieren. Vorher schlägt das fehl, weil GitHub die Domain prüft.
- Der Workflow liefert Dotfiles mit (`include-hidden-files: true`), sonst fehlten `.well-known/` und `.nojekyll`.

## Prüfen

```bash
curl -sI https://liga.kortform.at/.well-known/apple-app-site-association      # 200, Content-Type prüfen
curl -s  https://liga.kortform.at/.well-known/assetlinks.json | python3 -m json.tool
curl -s  https://app-site-association.cdn-apple.com/a/v1/liga.kortform.at     # Apple-CDN-Kopie (Cache bis ~24 h)
adb shell pm get-app-links com.swordistudios.kortform.dev                     # Status "verified" erwartet
adb shell pm verify-app-links --re-verify com.swordistudios.kortform.dev      # erneut prüfen lassen
curl -s -o /dev/null -w '%{http_code}\n' https://liga.kortform.at/t/abcdefghij0123456789  # 404 mit Seite (normal)
```

Android prüft App Links beim Installieren; nach Änderungen an `assetlinks.json` die App neu installieren oder
`--re-verify` ausführen. GitHub Pages liefert die Datei `apple-app-site-association` ohne Endung als
`application/octet-stream`; iOS akzeptiert das für Universal Links, über den Apple-CDN-Aufruf oben bestätigen.

## Lokal ansehen

```bash
cd site && python3 -m http.server 8000
```

Ein einfacher statischer Server liefert `404.html` nur über eine eigene Fallback-Regel. Zum Testen einen Server mit
404-Fallback auf `site/404.html` verwenden (Status 404, jeder unbekannte Pfad liefert die Datei) und
`http://localhost:<port>/d/<token>` bzw. `http://localhost:<port>/z/abcdefghijkl` öffnen.

Die Verfügbarkeitsseite lässt sich ohne Backend prüfen, indem ein Test-Skript `window.fetch` für
`https://<ref>.supabase.co/rest/v1/rpc/get_avail_season`, `…/submit_avail_answer` und `…/confirm_avail_answer` ersetzt (vor `config.js` einbinden, nicht
einchecken; mit dem CSP geht das nur über eine Datei von `localhost`, kein Inline-Skript). Ein echter Aufruf von `/z/<ID>`
gegen das Dev-Projekt prüft zusätzlich das CSP (es darf keine „Refused to connect“-Meldung erscheinen). Zustände zum Durchspielen:
Laden, „Wer bist du?“ (mit und ohne Suchfeld, Personen ohne Namen), Saisonliste, Erinnerung (fehlend, „Passt noch“, „Ändern“),
Fehler (Auswahl springt zurück), `meeting_closed`, `person_removed`, `not_found`, `expired`, Offline (`navigator.onLine` überschreiben und `offline`-Event auslösen), Hell/Dunkel,
Phone (390 px) und Desktop (≥ 1024 px). Die Seitenpfade sind absolut
(`/style.css`), daher funktioniert die Seite nur an der Wurzel einer Domain (nicht unter `mgursch.github.io/kortform-liga-web/`);
`.well-known/` lässt sich dort aber schon vor dem DNS-Eintrag prüfen.
