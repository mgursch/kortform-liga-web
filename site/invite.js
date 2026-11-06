/* Invite page (served as 404.html for /t/<token> and /d/<token>).
   /t/ = prod project, /d/ = dev project (config.js). Asks the public RPC get_invite_preview and shows the team, or a
   message for expired/used/revoked/unknown links. No cookies, no storage, no trackers; the token stays on this page
   and goes only to the matching Supabase project and into the kortform:// link. */
(function () {
  "use strict";

  var STORE_LINKS_ID = "stores";
  var MESSAGES = {
    expired: "Diese Einladung ist abgelaufen oder wurde schon verwendet. Bitte die Mannschaftsführung um einen neuen Link.",
    used: "Diese Einladung ist abgelaufen oder wurde schon verwendet. Bitte die Mannschaftsführung um einen neuen Link.",
    revoked: "Diese Einladung wurde zurückgezogen. Bitte die Mannschaftsführung um einen neuen Link.",
    unknown: "Diesen Einladungslink kennen wir nicht. Bitte prüfe, ob der Link vollständig ist, oder frag die Mannschaftsführung nach einem neuen Link."
  };
  var TITLES = {
    expired: "Einladung nicht mehr gültig",
    used: "Einladung nicht mehr gültig",
    revoked: "Einladung zurückgezogen",
    unknown: "Einladung nicht gefunden"
  };
  var VALID_TEXT = "Die Einladung lässt sich nur in der Kortform-App annehmen. Installiere die App und öffne den Link danach noch einmal.";
  var TIMEOUT_MS = 8000;

  function $(id) { return document.getElementById(id); }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    var first = Array.from(parts[0])[0] || "";
    var second = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] || "") : "";
    return (first + second).toUpperCase();
  }

  var BASE_TITLE = "Kortform";
  function setTitle(part) { document.title = part + " · " + BASE_TITLE; }

  function setText(id, text) {
    var el = $(id);
    el.textContent = text;
    el.hidden = !text;
  }

  /** Generic page: no preview (placeholder config, network error, unexpected answer). */
  function showGeneric() {
    setTitle("Einladung zur Mannschaftsführung");
    $("spinner").hidden = true;
    $("avatar").hidden = true;
    $("meta").hidden = true;
    setText("lead", "Einladung zur Mannschaftsführung");
    setText("title", "Mannschaftsführung in der Kortform-App");
    setText("text", VALID_TEXT);
    $(STORE_LINKS_ID).hidden = false;
  }

  function showInvalid(status) {
    setTitle(TITLES[status]);
    $("spinner").hidden = true;
    $("avatar").hidden = true;
    $("meta").hidden = true;
    $("lead").hidden = true;
    setText("title", TITLES[status]);
    setText("text", MESSAGES[status]);
    $(STORE_LINKS_ID).hidden = true;
    $("app-banner").hidden = true;
    $("home-link").hidden = false;
  }

  function showValid(preview) {
    setTitle("Einladung zur Mannschaftsführung");
    $("spinner").hidden = true;
    var inviter = typeof preview.inviter_display_name === "string" ? preview.inviter_display_name.trim() : "";
    var team = typeof preview.team_name === "string" ? preview.team_name.trim() : "";
    var league = [preview.league_name || preview.group_name, preview.season_short_name || preview.season_long_name]
      .filter(function (part) { return typeof part === "string" && part.trim(); })
      .map(function (part) { return part.trim(); })
      .join(" · ");
    var avatar = $("avatar");
    avatar.textContent = initials(inviter);
    avatar.hidden = !avatar.textContent;
    setText("lead", inviter ? inviter + " lädt dich ein" : "Einladung zur Mannschaftsführung");
    setText("title", team ? "Mannschaftsführung für " + team : "Mannschaftsführung in der Kortform-App");
    setText("meta", league);
    setText("text", VALID_TEXT);
    $(STORE_LINKS_ID).hidden = false;
  }

  function isPlaceholder(cfg) {
    return !cfg || !cfg.ref || !cfg.key || /_TBD$/.test(cfg.ref) || /_TBD$/.test(cfg.key);
  }

  function fetchPreview(cfg, token) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    return fetch("https://" + cfg.ref + ".supabase.co/rest/v1/rpc/get_invite_preview", {
      method: "POST",
      headers: { "apikey": cfg.key, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ p_token: token }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      if (!response.ok) throw new Error("http");
      return response.json();
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }

  function init() {
    var match = /^\/([td])\/([A-Za-z0-9_-]{4,64})\/?$/.exec(window.location.pathname);
    if (!match) {
      // Not an invite path: plain "not found" page.
      setTitle("Seite nicht gefunden");
      $("spinner").hidden = true;
      $("app-banner").hidden = true;
      $("avatar").hidden = true;
      $("lead").hidden = true;
      setText("title", "Seite nicht gefunden");
      setText("text", "Diese Seite gibt es nicht. Einladungslinks haben die Form liga.kortform.at/t/… und kommen von der Mannschaftsführung.");
      $(STORE_LINKS_ID).hidden = true;
      $("home-link").hidden = false;
      return;
    }

    var token = match[2];
    $("open-app").href = "kortform://invite/" + token;

    var cfg = window.LIGA_CONFIG && window.LIGA_CONFIG[match[1]];
    if (isPlaceholder(cfg)) { showGeneric(); return; }

    // Loading state: the copy stays hidden (markup default) until the preview arrives.
    $("spinner").hidden = false;

    fetchPreview(cfg, token).then(function (data) {
      var preview = Array.isArray(data) ? data[0] : data;
      var status = preview && preview.status;
      if (status === "valid") showValid(preview);
      else if (status === "expired" || status === "used" || status === "revoked" || status === "unknown") showInvalid(status);
      else showGeneric();
    }).catch(showGeneric);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
