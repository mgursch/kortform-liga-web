# kortform-liga-web

Einladungsseite und Verfügbarkeitsabfrage unter `https://liga.kortform.at` für „Liga teilen“ (Kort-ID) und die
Verfügbarkeitsabfrage in der Kortform-App. Statische Seite auf GitHub Pages, ohne Cookies, ohne Tracker, `noindex`.
Gehört zum Plan `docs/plans/kort-id-plan.md` im App-Repo `itn-rechner`.

## Was die Seite tut

- `/t/<token>` (Prod) und `/d/<token>` (Dev): GitHub Pages liefert dafür `404.html` aus. Die Seite liest Präfix und Token,
  fragt die öffentliche RPC `get_invite_preview` des passenden Supabase-Projekts ab und zeigt Mannschaft und Liga bzw. eine
  Meldung für abgelaufene, benutzte, zurückgezogene oder unbekannte Einladungen. Dazu ein Banner „In der App öffnen“
  (`kortform://invite/<token>` für `/t/`, `kortform-dev://invite/<token>` für `/d/`) und die Store-Buttons.
- Wenn die App installiert ist, öffnen Android App Links und iOS Universal Links den Link direkt in der App; die Seite
  erscheint nur ohne App.
- `/v/<ID>` (Prod) und `/w/<ID>` (Dev): **Verfügbarkeitsabfrage**, siehe unten.
- `/` (`index.html`): kurze Erklärung und Link auf kortform.at.
- `/.well-known/assetlinks.json` (Android) und `/.well-known/apple-app-site-association` (iOS).

## Verfügbarkeitsabfrage (`/v/<ID>`, `/w/<ID>`)

Antwortseite für Spieler*innen: Link `https://liga.kortform.at/v/<ID>` (Prod) bzw. `/w/<ID>` (Dev), `ID` = 12 Zeichen
`[A-Za-z0-9]` (`public_id` der Abfrage im Backend `kort-id-backend`, README-Abschnitt „Verfügbarkeitsabfrage“). Die Seite
kommt wie die Einladung über `404.html`; `route.js` (winzig, blockierend) erkennt `/v/` und `/w/` vor dem ersten Rendern und
blendet die Einladungsansicht aus, `poll.js` baut die Seite, `poll.css` gestaltet sie. `invite.js` tut auf diesen Pfaden nichts.

- **Ablauf:** `get_poll` (anon RPC) liefert Snapshot (Mannschaft, Spieltage, Kader). Ohne gespeicherte Identität „Wer bist
  du?“ (Kader alphabetisch nach Nachname, Anzeige „Nachname Vorname“, Suchfeld ab mehr als 10 Personen, „Ich bin nicht in der
  Liste“ → Vor- und Nachname, die Mannschaftsführung sieht „nicht im Kader“). Danach Antwortseite: nächster offener Spieltag als
  Karte (Ja / Nein / Unter Umständen, Kommentar bis 60 Zeichen erst nach einer Auswahl, speichert beim Verlassen des Feldes) und
  „Weitere Spieltage“ als Liste mit Segmented Button und Stift für den Kommentar. Jede Auswahl wird sofort per
  `submit_poll_answer` (`p_source: "web"`) gespeichert; bei einem Fehler springt die Auswahl zurück (Snackbar „Erneut“).
- **Nur bis zum Anstoß:** Spieltage mit `starts_at` in der Vergangenheit werden ausgeblendet (Serverzeit aus `server_time`,
  nicht die Gerätezeit); ist keiner mehr offen, steht „Die Saison ist zu Ende. Danke fürs Mitmachen!“. `meeting_closed` blendet
  den Spieltag sofort aus. Zeiten erscheinen in österreichischer Zeit.
- **Fehlercodes:** `poll_unknown`/unbekannt → „Diese Abfrage gibt es nicht mehr.“; `player_unknown` → Identität verwerfen und
  „Wer bist du?“; `poll_paused`, `poll_write_limit`, `manual_limit`, Netzwerk → Snackbar. Offline (`navigator.onLine`) zeigt
  den Banner und sperrt alle Eingaben.
- **Lokaler Speicher** (`localStorage`, Schlüssel `kortform.poll.<poll_uid>`, nicht `public_id`, damit ein zurückgesetzter Link
  die Antworten behält): gewählte Person (Kaderschlüssel oder manuelle ID `m_` + 12 Zeichen aus `crypto.getRandomValues`,
  samt Namen), eigene Antworten und Kommentare je Spieltag zum Wiederanzeigen. Alles in try/catch; ohne Speicher funktioniert
  die Seite, merkt sich aber nichts. Antworten von einem anderen Gerät sieht die Seite nicht (es gibt keine Lese-RPC).
- **App-Banner:** `kortform://poll/<ID>` (`/v/`) bzw. `kortform-dev://poll/<ID>` (`/w/`); ab 1024 px Kopfzeile mit
  „Google Play“ / „App Store“ (dieselben Store-Links wie die Einladungsseite), rechts die Karte „So funktioniert’s“.
- **Universal/App Links:** `/v/*` (Prod-App) und `/w/*` (Dev-App) stehen in `apple-app-site-association`; `assetlinks.json`
  ist pfadunabhängig und braucht keine Änderung. Die App muss die Pfade als Intent-Filter bzw. Deeplink annehmen.
- **Keys:** `config.js` ordnet `v` → Prod und `w` → Dev zu (dieselben Einträge wie `t` und `d`, keine neuen Secrets).
  Das CSP (`connect-src` nur die beiden Supabase-Hosts, `script-src 'self'`, `style-src 'self'`) bleibt unverändert; die Seite
  nutzt weder Inline-Skripte noch Inline-Styles.

## Struktur

```
site/
  CNAME                          # liga.kortform.at
  .nojekyll                      # kein Jekyll
  index.html, 404.html           # 404.html = Einladungs- und Verfügbarkeitsseite (Routing nach Pfad)
  style.css, invite.js           # Layout (hell/dunkel), Einladungslogik
  route.js, poll.js, poll.css    # Verfügbarkeitsabfrage (/v/<ID>, /w/<ID>)
  config.js                      # Supabase-Ref + publishable Key je Umgebung
  .well-known/                   # assetlinks.json, apple-app-site-association
  fonts/                         # Barlow Condensed, IBM Plex Sans (wie kortform.at)
.github/workflows/pages.yml      # Deploy bei Push auf main (Artefakt inkl. Dotfiles)
```

## Konfiguration pflegen

**Keys (`site/config.js`)**: `t` = Prod (`/t/`), `d` = Dev (`/d/`); `v` und `w` (Verfügbarkeitsabfrage) zeigen auf dieselben Einträge. Nur Projekt-Ref und der **publishable** Key
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
Pfaden `/t/*` und `/v/*`, Dev-Bundle `com.swordistudios.kortform.dev` mit `/d/*` und `/w/*`. Die App braucht das Entitlement
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
`http://localhost:<port>/d/<token>` bzw. `http://localhost:<port>/w/abcdefghijkl` öffnen.

Die Verfügbarkeitsseite lässt sich ohne Backend prüfen, indem ein Test-Skript `window.fetch` für
`https://<ref>.supabase.co/rest/v1/rpc/get_poll` und `…/submit_poll_answer` ersetzt (vor `config.js` einbinden, nicht
einchecken; mit dem CSP geht das nur über eine Datei von `localhost`, kein Inline-Skript). Ein echter Aufruf von `/w/<ID>`
gegen das Dev-Projekt prüft zusätzlich das CSP (es darf keine „Refused to connect“-Meldung erscheinen). Zustände zum Durchspielen:
Laden, „Wer bist du?“ (mit und ohne Suchfeld), Antwortseite, Fehler (Auswahl springt zurück), `meeting_closed`,
`player_unknown`, unbekannt, Saisonende, Offline (`navigator.onLine` überschreiben und `offline`-Event auslösen), Hell/Dunkel,
Phone (390 px) und Desktop (≥ 1024 px). Die Seitenpfade sind absolut
(`/style.css`), daher funktioniert die Seite nur an der Wurzel einer Domain (nicht unter `mgursch.github.io/kortform-liga-web/`);
`.well-known/` lässt sich dort aber schon vor dem DNS-Eintrag prüfen.
