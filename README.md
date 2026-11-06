# kortform-liga-web

Einladungsseite `https://liga.kortform.at` für „Liga teilen“ (Kort-ID) in der Kortform-App. Statische Seite auf GitHub Pages,
ohne Cookies, ohne Tracker, `noindex`. Gehört zum Plan `docs/plans/kort-id-plan.md` im App-Repo `itn-rechner`.

## Was die Seite tut

- `/t/<token>` (Prod) und `/d/<token>` (Dev): GitHub Pages liefert dafür `404.html` aus. Die Seite liest Präfix und Token,
  fragt die öffentliche RPC `get_invite_preview` des passenden Supabase-Projekts ab und zeigt Mannschaft und Liga bzw. eine
  Meldung für abgelaufene, benutzte, zurückgezogene oder unbekannte Einladungen. Dazu ein Banner „In der App öffnen“
  (`kortform://invite/<token>`) und die Store-Buttons.
- Wenn die App installiert ist, öffnen Android App Links und iOS Universal Links den Link direkt in der App; die Seite
  erscheint nur ohne App.
- `/` (`index.html`): kurze Erklärung und Link auf kortform.at.
- `/.well-known/assetlinks.json` (Android) und `/.well-known/apple-app-site-association` (iOS).

## Struktur

```
site/
  CNAME                          # liga.kortform.at
  .nojekyll                      # kein Jekyll
  index.html, 404.html           # 404.html = Einladungsseite
  style.css, invite.js           # Layout (hell/dunkel), Logik
  config.js                      # Supabase-Ref + publishable Key je Umgebung
  .well-known/                   # assetlinks.json, apple-app-site-association
  fonts/                         # Barlow Condensed, IBM Plex Sans (wie kortform.at)
.github/workflows/pages.yml      # Deploy bei Push auf main (Artefakt inkl. Dotfiles)
```

## Konfiguration pflegen

**Keys (`site/config.js`)**: `t` = Prod (`/t/`), `d` = Dev (`/d/`). Nur Projekt-Ref und der **publishable** Key
(`sb_publishable_…`, öffentlich gedacht). Nie einen Secret- oder Service-Role-Key eintragen. Holen:
`supabase projects api-keys --project-ref <REF>` (nur die Zeile `publishable` übernehmen).
Solange der Prod-Ref `PROD_REF_TBD` ist, zeigt `/t/…` die allgemeine Seite „In der App öffnen“ ohne Vorschau.
Wird der Prod-Ref gesetzt, **auch die `connect-src`-Liste im CSP-`<meta>` von `site/404.html` anpassen**
(`https://prod-ref-tbd.supabase.co` ersetzen), sonst blockiert der Browser die Abfrage.

**Android-Fingerprints (`site/.well-known/assetlinks.json`)**: je App-ID ein Eintrag.
- `com.swordistudios.kortform.dev`: SHA-256 des lokalen Debug-Keystores:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256`
- `com.swordistudios.kortform`: derzeit ein Platzhalter (nur Nullen). Eintragen: SHA-256 des **App-Signing-Keys** aus der Play
  Console (Test und Veröffentlichung → App-Signatur) und des **Upload-Keys** (zweiter Fingerprint in der Liste, damit
  auch lokal signierte Builds verifizieren). Weitere Geräte-Debug-Keystores bei Bedarf als zusätzliche Fingerprints.

**iOS (`site/.well-known/apple-app-site-association`)**: Team-ID `84TKTNMRH2`; Prod-Bundle `com.swordistudios.kortform` mit
Pfad `/t/*`, Dev-Bundle `com.swordistudios.kortform.dev` mit `/d/*`. Die App braucht das Entitlement
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

Statischer Server liefert `404.html` nur mit eigener Regel; zum Testen die Seite direkt als
`http://localhost:8000/404.html` öffnen (Pfad passt dann nicht auf `/t/…`; für den Pfadtest einen Server mit 404-Fallback
verwenden oder die Seite nach dem Deploy auf `https://mgursch.github.io/kortform-liga-web/t/<token>` prüfen).
