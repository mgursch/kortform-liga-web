/* Availability poll page (served as 404.html for /v/<id> = prod and /w/<id> = dev, config.js).
   Players pick who they are, then answer "Kannst du spielen?" per match. Talks only to the two public RPCs
   get_poll and submit_poll_answer of the matching Supabase project (publishable key, role anon).
   No cookies, no analytics, no trackers. Local storage (per poll_uid) keeps the chosen identity and the own answers;
   every access is wrapped in try/catch and the page works without it. No inline scripts or styles (CSP). */
(function () {
  "use strict";

  var root = document.getElementById("poll-view");
  // Same test as route.js (which already hid the invite view): every /v/… and /w/… path is ours, a malformed id shows
  // "unknown" instead of a blank page.
  var route = /^\/([vw])\/(.*)$/.exec(window.location.pathname);
  if (!root || !route) return; // not a poll path: invite.js handles the page

  var PREFIX = route[1];
  var PUBLIC_ID = route[2].replace(/\/$/, "");
  var ID_OK = /^[A-Za-z0-9]{12}$/.test(PUBLIC_ID);
  // Custom scheme per environment, same idea as invite.js: prod kortform://, dev kortform-dev://.
  var SCHEME = PREFIX === "w" ? "kortform-dev" : "kortform";
  var STORE_PLAY = "https://play.google.com/store/apps/details?id=com.swordistudios.kortform";
  var STORE_APPLE = "https://apps.apple.com/at/app/kortform-tennis-wertung/id6826770040";
  var PRIVACY_URL = "https://kortform.at/datenschutz/";
  var TIMEOUT_MS = 10000;
  var COMMENT_MAX = 60;
  var MANUAL_NAME_MAX = 40;
  var ROSTER_SEARCH_MIN = 11; // search field when more than 10 people
  var REFRESH_AFTER_MS = 10 * 60 * 1000;

  var STATUS = {
    yes: { label: "Ja", icon: "check" },
    no: { label: "Nein", icon: "x" },
    maybe: { label: "Unter Umständen", icon: "maybe" }
  };
  var ORDER = ["yes", "no", "maybe"];

  var TEXT = {
    unknown: "Diese Abfrage gibt es nicht mehr.",
    end: "Die Saison ist zu Ende. Danke fürs Mitmachen!",
    loadError: "Die Abfrage konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es noch einmal.",
    offline: "Keine Verbindung. Antworten sind möglich, sobald du wieder online bist.",
    saved: "Gespeichert",
    notSaved: "Nicht gespeichert – erneut versuchen",
    retry: "Erneut",
    paused: "Antworten sind gerade pausiert. Bitte versuche es später noch einmal.",
    writeLimit: "Gerade sind zu viele Antworten unterwegs. Bitte versuche es in ein paar Minuten noch einmal.",
    closed: "Dieser Spieltag hat schon begonnen. Antworten sind nicht mehr möglich.",
    playerUnknown: "Bitte wähle dich noch einmal aus.",
    changed: "Der Spielplan hat sich geändert. Bitte prüfe deine Antwort.",
    invalid: "Nicht gespeichert. Bitte prüfe deine Eingabe.",
    manualLimit: "Es sind schon sehr viele Personen ohne Kaderplatz eingetragen. Bitte melde dich bei der Mannschaftsführung."
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Small helpers

  var ICONS = {
    check: ["M5 12l5 5 9-10"],
    x: ["M6 6l12 12M18 6L6 18"],
    maybe: ["M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1.1-1.3 2v.6", "M12 17.6v.2"],
    pin: ["M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z", "c:12,10,2.5"],
    pen: ["M4 20h4L19 9l-4-4L4 16z"],
    search: ["c:11,11,7", "M20 20l-3.5-3.5"],
    userplus: ["c:10,8,4", "M3 21c1.3-3.8 4-5.8 7-5.8 1.3 0 2.5.3 3.6 1", "M19 14v6M16 17h6"],
    wifioff: ["M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-8.4-3.7M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.7-2", "M8.5 16.4a5 5 0 0 1 7 0", "M12 20h.01", "M3 3l18 18"],
    back: ["M19 12H5", "M12 19l-7-7 7-7"],
    external: ["M14 4h6v6", "M20 4l-9 9", "M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"],
    info: ["c:12,12,10", "M12 11v5", "M12 8v.01"]
  };
  var SVG_NS = "http://www.w3.org/2000/svg";

  function icon(name, size, stroke) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", String(stroke || 2));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    ICONS[name].forEach(function (part) {
      var el;
      if (part.indexOf("c:") === 0) {
        var c = part.slice(2).split(",");
        el = document.createElementNS(SVG_NS, "circle");
        el.setAttribute("cx", c[0]);
        el.setAttribute("cy", c[1]);
        el.setAttribute("r", c[2]);
      } else {
        el = document.createElementNS(SVG_NS, "path");
        el.setAttribute("d", part);
      }
      svg.appendChild(el);
    });
    return svg;
  }

  function logo() {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("viewBox", "0 0 108 108");
    svg.setAttribute("fill", "none");
    var line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("stroke", "#3ea56b");
    line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("points", "18,38 24,38 30,45 36,45 42,34 48,34 54,52 60,52 66,62 72,62 78,57 84,57 90,72");
    svg.appendChild(line);
    return svg;
  }

  /** Builds an element. Children may be nodes, strings (text nodes), arrays or null. Never uses innerHTML. */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key.indexOf("on") === 0) el.addEventListener(key.slice(2), value);
        else if (value === true) el.setAttribute(key, "");
        else el.setAttribute(key, String(value));
      });
    }
    for (var i = 2; i < arguments.length; i += 1) appendKids(el, arguments[i]);
    return el;
  }

  function appendKids(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { appendKids(el, k); }); return; }
    el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }

  /** Appends several children (null-safe), like ParentNode.append without printing "null". */
  function put(parent) { for (var i = 1; i < arguments.length; i += 1) appendKids(parent, arguments[i]); }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function str(value) { return typeof value === "string" ? value.trim() : ""; }

  /** Removes control characters (C0, DEL, C1, line/paragraph separators: what the server rejects) and trims. */
  function clean(value) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").trim(); }

  /** At most max characters (code points, like the server's char_length), never splitting a surrogate pair. */
  function cut(value, max) { return Array.from(value).slice(0, max).join(""); }

  var uidCounter = 0;
  function uid(prefix) { uidCounter += 1; return prefix + uidCounter; }

  // ---------------------------------------------------------------------------------------------------------------
  // Dates (always shown in Austrian time, like the league schedule, whatever the device time zone is)

  var DOW = { Sun: "So", Mon: "Mo", Tue: "Di", Wed: "Mi", Thu: "Do", Fri: "Fr", Sat: "Sa" };
  var viennaFormat = null;
  try {
    viennaFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch (e) { viennaFormat = null; }

  /** "Sa, 14.11. · 14:00", or "Termin offen" without a start time. */
  function formatWhen(ms) {
    if (ms === null) return "Termin offen";
    var date = new Date(ms);
    var weekday, day, month, hour, minute;
    if (viennaFormat) {
      var parts = {};
      viennaFormat.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
      weekday = DOW[parts.weekday] || parts.weekday;
      day = parts.day; month = parts.month; hour = parts.hour; minute = parts.minute;
    } else {
      weekday = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][date.getDay()];
      day = String(date.getDate()); month = String(date.getMonth() + 1);
      hour = String(date.getHours()).padStart(2, "0"); minute = String(date.getMinutes()).padStart(2, "0");
    }
    return weekday + ", " + day + "." + month + ". · " + hour + ":" + minute;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // State

  var S = {
    poll: null,            // normalized poll: {uid, team, meetings, roster}
    offset: 0,             // server time minus device time, so a wrong device clock does not matter
    fetchedAt: 0,
    store: { answers: {} },
    identity: null,
    answers: {},           // optimistic own answers of the current identity: meetingId -> {status, comment}
    confirmed: {},         // answers the server confirmed (and local storage knows)
    closed: {},            // meetings the server reported as closed
    queue: {},             // per meeting: promise chain so saves run in order
    ui: {},                // per meeting: {update()}
    online: navigator.onLine !== false,
    view: "loading",
    openIds: "",
    snackTimer: null
  };

  var el = {}; // shell elements

  // ---------------------------------------------------------------------------------------------------------------
  // Local storage (per poll_uid, so a reset link keeps the answers)

  function storageKey() { return "kortform.poll." + S.poll.uid; }

  function loadStore() {
    var out = { answers: {} };
    try {
      var raw = window.localStorage.getItem(storageKey());
      var data = raw ? JSON.parse(raw) : null;
      if (isObject(data)) {
        if (isObject(data.identity)) out.identity = data.identity;
        if (isObject(data.manual)) out.manual = data.manual;
        if (isObject(data.answers)) {
          Object.keys(data.answers).forEach(function (who) {
            var mine = data.answers[who];
            if (!isObject(mine)) return;
            out.answers[who] = {};
            Object.keys(mine).forEach(function (mid) {
              var a = mine[mid];
              if (isObject(a) && STATUS[a.status]) out.answers[who][mid] = { status: a.status, comment: cut(clean(a.comment), COMMENT_MAX) };
            });
          });
        }
      }
    } catch (e) { /* storage unavailable or corrupt: start empty */ }
    return out;
  }

  function saveStore() {
    try { window.localStorage.setItem(storageKey(), JSON.stringify(S.store)); } catch (e) { /* ignore */ }
  }

  var MANUAL_ID = /^m_[A-Za-z0-9_-]{12}$/;

  /** "m_" + 12 base64url characters from 9 random bytes. */
  function newManualId() {
    var bytes = new Uint8Array(9);
    window.crypto.getRandomValues(bytes);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return "m_" + window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
  }

  function identityKey(identity) { return identity.kind === "roster" ? "r:" + identity.key : identity.manual_id; }

  /** Returns the stored identity if it is still usable for this snapshot, otherwise null. */
  function validIdentity(identity) {
    if (!isObject(identity)) return null;
    if (identity.kind === "roster") {
      var found = S.poll.roster.some(function (p) { return p.key === identity.key; });
      return found ? { kind: "roster", key: identity.key } : null;
    }
    if (identity.kind === "manual" && MANUAL_ID.test(identity.manual_id || "")) {
      var first = cut(clean(identity.first), MANUAL_NAME_MAX);
      var last = cut(clean(identity.last), MANUAL_NAME_MAX);
      if (!first || !last) return null;
      return { kind: "manual", manual_id: identity.manual_id, first: first, last: last, confirmed: identity.confirmed === true };
    }
    return null;
  }

  function setIdentity(identity) {
    S.identity = identity;
    S.store.identity = identity;
    var mine = S.store.answers[identityKey(identity)] || {};
    S.confirmed = {};
    S.answers = {};
    Object.keys(mine).forEach(function (mid) {
      S.confirmed[mid] = { status: mine[mid].status, comment: mine[mid].comment };
      S.answers[mid] = S.confirmed[mid];
    });
    saveStore();
  }

  function clearIdentity() {
    S.identity = null;
    delete S.store.identity;
    S.answers = {};
    S.confirmed = {};
    saveStore();
  }

  function persistConfirmed() {
    if (!S.identity) return;
    var mine = {};
    Object.keys(S.confirmed).forEach(function (mid) { mine[mid] = { status: S.confirmed[mid].status, comment: S.confirmed[mid].comment }; });
    S.store.answers[identityKey(S.identity)] = mine;
    if (S.identity.kind === "manual") S.store.identity = S.identity;
    saveStore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Network

  function RpcError(code, detail) { this.code = code; this.detail = detail || ""; }

  function rpc(name, body) {
    var cfg = window.LIGA_CONFIG && window.LIGA_CONFIG[PREFIX];
    if (!cfg || !cfg.ref || !cfg.key || /_TBD$/.test(cfg.ref) || /_TBD$/.test(cfg.key)) return Promise.reject(new RpcError("config"));
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    return fetch("https://" + cfg.ref + ".supabase.co/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "apikey": cfg.key, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (timer) clearTimeout(timer);
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) {
          throw new RpcError(isObject(data) && typeof data.message === "string" ? data.message : "http",
            isObject(data) && typeof data.details === "string" ? data.details : "");
        }
        return data;
      });
    }, function () {
      if (timer) clearTimeout(timer);
      throw new RpcError("network");
    });
  }

  /** Validates and normalizes the get_poll answer; returns null for anything unexpected. */
  function normalizePoll(data) {
    var poll = Array.isArray(data) ? data[0] : data;
    if (!isObject(poll) || poll.status !== "active" || !isObject(poll.snapshot)) return null;
    var snap = poll.snapshot;
    var team = isObject(snap.team) ? snap.team : {};
    var meetings = (Array.isArray(snap.meetings) ? snap.meetings : []).filter(function (m) { return isObject(m) && typeof m.id === "string" && m.id; }).map(function (m) {
      var ms = typeof m.starts_at === "string" ? Date.parse(m.starts_at) : NaN;
      return {
        id: m.id,
        round: typeof m.round === "number" ? m.round : null,
        startsMs: isNaN(ms) ? null : ms,
        home: m.home === true,
        opponent: str(m.opponent),
        address: str(m.address)
      };
    });
    var roster = (Array.isArray(snap.roster) ? snap.roster : []).filter(function (p) { return isObject(p) && typeof p.key === "string" && p.key; }).map(function (p) {
      return { key: p.key, first: str(p.first), last: str(p.last), itn: typeof p.itn === "number" ? p.itn : null };
    });
    var serverMs = typeof poll.server_time === "string" ? Date.parse(poll.server_time) : NaN;
    return {
      poll: {
        uid: typeof poll.poll_uid === "string" && poll.poll_uid ? poll.poll_uid : PUBLIC_ID,
        team: { name: str(team.name), category: str(team.category), season: str(team.season_short) || str(team.season_long) },
        meetings: meetings,
        roster: roster
      },
      offset: isNaN(serverMs) ? 0 : serverMs - Date.now()
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Derived data

  function now() { return Date.now() + S.offset; }

  /** Meetings that can still be answered (before kickoff), earliest first; dateless ones last. */
  function openMeetings() {
    var t = now();
    return S.poll.meetings.filter(function (m) {
      return !S.closed[m.id] && (m.startsMs === null || m.startsMs > t);
    }).sort(function (a, b) {
      var am = a.startsMs === null ? Infinity : a.startsMs;
      var bm = b.startsMs === null ? Infinity : b.startsMs;
      if (am !== bm) return am < bm ? -1 : 1;
      return (a.round === null ? 1e6 : a.round) - (b.round === null ? 1e6 : b.round);
    });
  }

  function openSignature() { return openMeetings().map(function (m) { return m.id; }).join("|"); }

  /** League convention: "Nachname Vorname". */
  function personName(p) {
    var name = [p.last, p.first].filter(Boolean).join(" ");
    return name || p.key;
  }

  function identityName() {
    if (!S.identity) return "";
    if (S.identity.kind === "manual") return [S.identity.last, S.identity.first].filter(Boolean).join(" ");
    var person = S.poll.roster.filter(function (p) { return p.key === S.identity.key; })[0];
    return person ? personName(person) : "";
  }

  function initials(p) {
    var a = Array.from(p.last || "")[0] || "";
    var b = Array.from(p.first || "")[0] || "";
    var out = (a + b).toUpperCase();
    return out || (Array.from(p.key)[0] || "?").toUpperCase();
  }

  var collator = (function () { try { return new Intl.Collator("de", { sensitivity: "base" }); } catch (e) { return null; } }());
  function compare(a, b) { return collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }

  function sortedRoster() {
    return S.poll.roster.slice().sort(function (a, b) {
      return compare(a.last, b.last) || compare(a.first, b.first) || compare(a.key, b.key);
    });
  }

  function normalizeForSearch(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function formatItn(itn) {
    if (itn === null) return "";
    try { return itn.toLocaleString("de-AT", { minimumFractionDigits: 3, maximumFractionDigits: 3 }); } catch (e) { return itn.toFixed(3).replace(".", ","); }
  }

  function headline() {
    var t = S.poll.team;
    return [t.category, t.season].filter(Boolean).join(" · ") || t.name || "Verfügbarkeit";
  }

  function setTitle(part) { document.title = (part ? part + " · " : "") + "Kortform"; }

  // ---------------------------------------------------------------------------------------------------------------
  // Shell: header, content column, aside, footer, snackbar

  function buildShell() {
    clear(root);
    var openApp = ID_OK ? h("a", { class: "btn btn-small", href: SCHEME + "://poll/" + PUBLIC_ID, text: "In der App öffnen" }) : null;

    el.banner = h("div", { class: "app-banner pv-banner", hidden: !ID_OK },
      h("span", { class: "app-icon" }, logo()),
      h("span", { class: "app-banner-text" }, h("strong", { text: "Kortform-App" }), h("span", { text: "schneller in der App" })),
      openApp);

    el.header = h("header", { class: "pv-header" },
      h("span", { class: "app-icon" }, logo()),
      h("a", { class: "pv-wordmark", href: "https://kortform.at/", text: "Kortform" }),
      h("span", { class: "pv-top-sub", text: "· Verfügbarkeit" }),
      h("span", { class: "pv-store-hint", text: "Mit der App geht’s schneller:" }),
      h("a", { class: "pv-store", href: STORE_PLAY, rel: "noopener noreferrer" }, icon("external", 16), "Google Play"),
      h("a", { class: "pv-store", href: STORE_APPLE, rel: "noopener noreferrer" }, icon("external", 16), "App Store"));

    el.top = h("div", { class: "pv-top" },
      h("a", { class: "pv-wordmark", href: "https://kortform.at/", text: "Kortform" }),
      h("span", { class: "pv-top-sub", text: "· Verfügbarkeit" }));

    el.col = h("div", { class: "pv-col" });
    el.aside = h("aside", { class: "pv-aside", "aria-label": "Hinweis", hidden: true },
      h("div", { class: "pv-card" },
        h("div", { class: "pv-card-label", text: "So funktioniert’s" }),
        h("p", { text: "Jede Auswahl wird sofort gespeichert. Du kannst sie jederzeit ändern. Nur die Mannschaftsführung sieht die Antworten." })));
    el.main = h("main", { class: "pv-main" }, el.col, el.aside);

    el.snackText = h("span", { class: "pv-snack-text" });
    el.snackAction = h("button", { type: "button", hidden: true });
    el.snack = h("div", { class: "pv-snack", hidden: true }, el.snackText, el.snackAction);

    root.append(el.banner, el.header, el.top, el.main,
      h("footer", null,
        h("span", { text: "liga.kortform.at · keine Tracking-Cookies" }),
        h("a", { href: PRIVACY_URL, rel: "noopener noreferrer", text: "Datenschutz" })),
      h("div", { role: "status", "aria-live": "polite" }, el.snack));
    root.hidden = false;
  }

  function snack(text, actionLabel, onAction) {
    clearTimeout(S.snackTimer);
    el.snackText.textContent = text;
    if (actionLabel) {
      el.snackAction.textContent = actionLabel;
      el.snackAction.hidden = false;
      el.snackAction.onclick = function () { hideSnack(); onAction(); };
    } else {
      el.snackAction.hidden = true;
      el.snackAction.onclick = null;
    }
    el.snack.hidden = false;
    S.snackTimer = setTimeout(hideSnack, actionLabel ? 9000 : 3500);
  }

  function hideSnack() { clearTimeout(S.snackTimer); el.snack.hidden = true; }

  function show(view) {
    // Focus inside the column (or lost to the body by a removed button) would vanish with the re-render: remember it,
    // the render then moves it to the new heading.
    var active = document.activeElement;
    S.hadFocus = !!active && (active === document.body || el.col.contains(active));
    S.view = view;
    S.ui = {};
    S.offlineEl = null;
    el.aside.hidden = view !== "answer";
    clear(el.col);
    window.scrollTo(0, 0);
  }

  function focusHeading() {
    var heading = el.col.querySelector("[data-focus]");
    if (heading) heading.focus({ preventScroll: true });
  }

  /** End of every render: focus the new heading after a user action or when focus was in the old content. */
  function settleFocus(focus) { if (focus === true || S.hadFocus) focusHeading(); }

  // ---------------------------------------------------------------------------------------------------------------
  // Plain message views

  function renderLoading() {
    show("loading");
    el.col.appendChild(h("div", { class: "pv-loading" }, h("div", { class: "spinner", role: "status", "aria-label": "Abfrage wird geladen" })));
  }

  function renderMessage(view, title, text, iconName, button) {
    show(view);
    setTitle(title);
    el.col.appendChild(h("div", { class: "pv-message" },
      h("span", { class: "pv-message-icon", "aria-hidden": "true" }, icon(iconName, 44, 1.8)),
      h("p", { text: text, tabindex: "-1", "data-focus": "" }),
      button));
    settleFocus(true);
  }

  function renderUnknown() { renderMessage("unknown", "Abfrage nicht gefunden", TEXT.unknown, "info"); }
  function renderEnd() { renderMessage("end", "Saison beendet", TEXT.end, "check"); }

  function renderLoadError() {
    var retry = h("button", { type: "button", class: "btn btn-large", text: "Erneut versuchen", onclick: function () { load(true); } });
    renderMessage("error", "Abfrage nicht geladen", TEXT.loadError, "wifioff", retry);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // "Wer bist du?"

  function renderWho(focus) {
    show("who");
    setTitle("Wer bist du?");
    var roster = sortedRoster();
    var list = h("ul", { class: "pv-people" });
    var none = h("p", { class: "pv-none", text: "Keine Treffer. Falls du nicht im Kader stehst, wähle „Ich bin nicht in der Liste“.", hidden: true });

    function fill(query) {
      var q = normalizeForSearch(query.trim());
      clear(list);
      var count = 0;
      roster.forEach(function (p) {
        if (q && normalizeForSearch(p.last + " " + p.first).indexOf(q) < 0 && normalizeForSearch(p.first + " " + p.last).indexOf(q) < 0) return;
        count += 1;
        list.appendChild(h("li", null,
          h("button", { type: "button", class: "pv-person", onclick: function () { choosePerson(p); } },
            h("span", { class: "pv-avatar", "aria-hidden": "true", text: initials(p) }),
            h("span", { class: "pv-person-name", text: personName(p) }),
            p.itn === null ? null : h("span", { class: "pv-itn", text: formatItn(p.itn) }))));
      });
      none.hidden = !(q && count === 0);
    }

    var search = null;
    if (roster.length >= ROSTER_SEARCH_MIN) {
      var input = h("input", { type: "search", placeholder: "Name suchen", "aria-label": "Name suchen", autocomplete: "off", enterkeyhint: "search", oninput: function () { fill(input.value); } });
      search = h("label", { class: "pv-search" }, icon("search", 24), input);
    }

    put(el.col, 
      h("p", { class: "pv-eyebrow", text: [S.poll.team.category, S.poll.team.season, S.poll.team.name].filter(Boolean).join(" · ") }),
      h("h1", { class: "pv-h1", text: "Wer bist du?", tabindex: "-1", "data-focus": "" }),
      search,
      list,
      none,
      h("button", { type: "button", class: "pv-notinlist", onclick: renderManual },
        h("span", { class: "pv-icon-slot" }, icon("userplus", 22)),
        "Ich bin nicht in der Liste"));
    fill("");
    settleFocus(focus);
  }

  function choosePerson(p) {
    setIdentity({ kind: "roster", key: p.key });
    renderAnswer(true);
  }

  function renderManual() {
    show("manual");
    setTitle("Nicht in der Liste");
    var prefill = isObject(S.store.manual) ? S.store.manual : {};
    function field(label, autocomplete, value) {
      var input = h("input", { type: "text", maxlength: String(MANUAL_NAME_MAX), autocomplete: autocomplete, required: true, "aria-required": "true", value: value || "", oninput: sync });
      return { input: input, node: h("div", { class: "pv-fieldwrap" }, h("label", { class: "pv-field" }, h("span", { class: "pv-float", text: label }), input)) };
    }
    var first = field("Vorname *", "given-name", clean(prefill.first));
    var last = field("Nachname *", "family-name", clean(prefill.last));
    var submit = h("button", { type: "submit", class: "btn btn-large", text: "Weiter" });
    function sync() { submit.disabled = !(clean(first.input.value) && clean(last.input.value)); }
    sync();

    var form = h("form", { class: "pv-form", novalidate: true, onsubmit: function (event) {
      event.preventDefault();
      var f = cut(clean(first.input.value), MANUAL_NAME_MAX);
      var l = cut(clean(last.input.value), MANUAL_NAME_MAX);
      if (!f || !l) return;
      var stored = S.store.manual;
      var id = isObject(stored) && MANUAL_ID.test(stored.manual_id || "") ? stored.manual_id : newManualId();
      var same = isObject(stored) && stored.first === f && stored.last === l;
      var wasConfirmed = isObject(S.store.identity) && S.store.identity.kind === "manual" && S.store.identity.manual_id === id && S.store.identity.confirmed === true;
      S.store.manual = { manual_id: id, first: f, last: l };
      setIdentity({ kind: "manual", manual_id: id, first: f, last: l, confirmed: same && wasConfirmed });
      renderAnswer(true);
    } }, first.node, last.node, submit);

    put(el.col, 
      h("button", { type: "button", class: "pv-back", onclick: function () { renderWho(true); } }, icon("back", 20), "Zurück"),
      h("p", { class: "pv-eyebrow", text: [S.poll.team.category, S.poll.team.season, S.poll.team.name].filter(Boolean).join(" · ") }),
      h("h1", { class: "pv-h1", text: "Nicht in der Liste", tabindex: "-1", "data-focus": "" }),
      h("p", { class: "pv-lede", text: "Die Mannschaftsführung sieht deinen Namen mit dem Hinweis „nicht im Kader“." }),
      form);
    settleFocus(true);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Answer page

  function opponentLine(meeting, small) {
    return h("span", { class: "pv-vs" },
      h("span", { class: "pv-chip" + (meeting.home ? " home" : ""), text: meeting.home ? "Heim" : "Ausw." }),
      h("span", { class: "pv-vs-name", text: meeting.opponent ? (small ? meeting.opponent : "gegen " + meeting.opponent) : "Gegner offen" }));
  }

  function mapsLink(address) {
    return h("a", { class: "pv-map", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address), target: "_blank", rel: "noopener noreferrer" },
      icon("pin", 16), address);
  }

  /** Comment field. enabled only after a status was chosen; saves when the field loses focus. */
  function commentField(meeting) {
    var hintId = uid("pv-hint-");
    var countId = uid("pv-count-");
    var input = h("input", { type: "text", maxlength: String(COMMENT_MAX), placeholder: "z. B. erst ab 14 Uhr", autocomplete: "off", "aria-describedby": hintId + " " + countId, enterkeyhint: "done" });
    var hint = h("span", { id: hintId, text: "Wähle zuerst eine Antwort." });
    var count = h("span", { class: "pv-count", id: countId });
    var wrap = h("div", { class: "pv-fieldwrap" },
      h("label", { class: "pv-field" }, h("span", { class: "pv-float", text: "Kommentar (optional)" }), input),
      h("div", { class: "pv-hintrow" }, hint, count));

    // value.length (UTF-16 units) is what maxlength counts, so the counter reaches 60/60 exactly when typing stops.
    function updateCount() { count.textContent = input.value.length + "/" + COMMENT_MAX; }
    input.addEventListener("input", updateCount);
    input.addEventListener("change", function () { saveComment(meeting.id, input.value); input.value = clean(input.value); updateCount(); });

    return {
      wrap: wrap,
      input: input,
      update: function () {
        var answer = S.answers[meeting.id];
        input.disabled = !answer || !S.online;
        hint.hidden = !!answer;
        if (document.activeElement !== input) input.value = answer ? answer.comment : "";
        updateCount();
      }
    };
  }

  function nextCard(meeting) {
    var comment = commentField(meeting);
    var buttons = {};
    var group = h("div", { class: "pv-answers", role: "group", "aria-label": "Kannst du spielen?" });
    ORDER.forEach(function (status) {
      buttons[status] = h("button", { type: "button", class: "pv-answer", "aria-pressed": "false", onclick: function () { choose(meeting.id, status); } },
        icon(STATUS[status].icon, 20, 2.4), STATUS[status].label);
      group.appendChild(buttons[status]);
    });

    var card = h("section", { class: "pv-card", "aria-label": "Nächster Spieltag" },
      h("div", { class: "pv-card-label", text: "Nächster Spieltag" + (meeting.round !== null ? " · Runde " + meeting.round : "") }),
      h("div", { class: "pv-when-block" },
        h("span", { class: "pv-when", text: formatWhen(meeting.startsMs) }),
        opponentLine(meeting, false),
        meeting.address ? mapsLink(meeting.address) : null),
      h("div", { class: "pv-q", text: "Kannst du spielen?" }),
      group,
      comment.wrap);

    S.ui[meeting.id] = {
      update: function () {
        var answer = S.answers[meeting.id];
        ORDER.forEach(function (status) {
          buttons[status].setAttribute("aria-pressed", answer && answer.status === status ? "true" : "false");
          buttons[status].disabled = !S.online;
        });
        comment.update();
      }
    };
    return card;
  }

  function meetingRow(meeting) {
    var comment = commentField(meeting);
    var open = false;
    var buttons = {};
    var icons = {};
    var label = formatWhen(meeting.startsMs) + (meeting.round !== null ? ", Runde " + meeting.round : "");
    var seg = h("div", { class: "pv-seg", role: "group", "aria-label": "Antwort für " + label });
    ORDER.forEach(function (status) {
      icons[status] = h("span", { hidden: true }, icon(STATUS[status].icon, 14, 2.6));
      buttons[status] = h("button", { type: "button", "aria-pressed": "false", onclick: function () { choose(meeting.id, status); } }, icons[status], STATUS[status].label);
      seg.appendChild(buttons[status]);
    });
    var shownComment = h("span", { class: "pv-row-comment", hidden: true });
    var pen = h("button", { type: "button", class: "pv-pen", "aria-label": "Kommentar für " + label, "aria-expanded": "false", onclick: function () {
      open = !open;
      update();
      if (open && !comment.input.disabled) comment.input.focus();
    } }, icon("pen", 24));
    comment.wrap.hidden = true;

    var row = h("li", { class: "pv-row" },
      h("span", { class: "pv-row-date" }, formatWhen(meeting.startsMs), meeting.round !== null ? h("span", { class: "pv-r", text: " · R" + meeting.round }) : null),
      h("span", { class: "pv-row-vs" }, opponentLine(meeting, true), shownComment),
      seg, pen, comment.wrap);

    function update() {
      var answer = S.answers[meeting.id];
      ORDER.forEach(function (status) {
        var on = !!answer && answer.status === status;
        buttons[status].setAttribute("aria-pressed", on ? "true" : "false");
        buttons[status].disabled = !S.online;
        icons[status].hidden = !on;
      });
      var text = answer ? answer.comment : "";
      shownComment.hidden = !text || open;
      shownComment.textContent = text ? "„" + text + "“" : "";
      pen.setAttribute("aria-expanded", open ? "true" : "false");
      pen.disabled = !S.online;
      comment.wrap.hidden = !open;
      comment.update();
    }
    S.ui[meeting.id] = { update: update };
    return row;
  }

  function renderAnswer(focus) {
    var meetings = openMeetings();
    if (meetings.length === 0) { renderEnd(); return; }
    show("answer");
    S.openIds = meetings.map(function (m) { return m.id; }).join("|");
    setTitle(headline());

    var rest = meetings.slice(1);
    var sub = h("p", { class: "pv-sub" },
      (S.poll.team.name ? S.poll.team.name + " · " : "") + "Antwort von " + identityName() + " · ",
      h("button", { type: "button", class: "pv-linkbtn", text: "Nicht du? Ändern", onclick: function () { renderWho(true); } }));

    S.offlineEl = h("div", { class: "pv-offline", role: "status", hidden: S.online }, icon("wifioff", 20), h("span", { text: TEXT.offline }));

    put(el.col, 
      h("h1", { class: "pv-title", text: headline(), tabindex: "-1", "data-focus": "" }),
      sub,
      S.offlineEl,
      nextCard(meetings[0]));

    if (rest.length) {
      var list = h("ul", { class: "pv-rows" });
      rest.forEach(function (m) { list.appendChild(meetingRow(m)); });
      put(el.col, 
        h("div", { class: "pv-section" },
          h("h2", { class: "pv-card-label", text: "Weitere Spieltage" }),
          h("span", { class: "pv-section-note", text: "vergangene ausgeblendet" })),
        list);
    }
    refreshAll();
    settleFocus(focus);
  }

  function refresh(mid) { if (S.ui[mid]) S.ui[mid].update(); }
  function refreshAll() { Object.keys(S.ui).forEach(refresh); }

  // ---------------------------------------------------------------------------------------------------------------
  // Saving answers

  function playerPayload() {
    var id = S.identity;
    if (id.kind === "roster") return { ref: id.key };
    if (id.confirmed) return { ref: id.manual_id };
    return { manual_id: id.manual_id, first_name: id.first, last_name: id.last };
  }

  function choose(mid, status) {
    if (!S.online || !S.identity) return;
    var current = S.answers[mid];
    if (current && current.status === status) return;
    commit(mid, { status: status, comment: current ? current.comment : "" });
  }

  function saveComment(mid, value) {
    var current = S.answers[mid];
    if (!current || !S.online) return;
    var comment = cut(clean(value), COMMENT_MAX);
    if (comment === current.comment) return;
    commit(mid, { status: current.status, comment: comment });
  }

  /** Shows the answer at once, saves it in order per meeting and springs back when saving fails. */
  function commit(mid, attempt) {
    var identity = S.identity;
    S.answers[mid] = attempt;
    refresh(mid);
    var previous = S.queue[mid] || Promise.resolve();
    S.queue[mid] = previous.then(function () {
      if (S.identity !== identity) return null; // identity changed meanwhile: drop
      return rpc("submit_poll_answer", {
        p_public_id: PUBLIC_ID,
        p_meeting_id: mid,
        p_player: playerPayload(),
        p_status: attempt.status,
        p_comment: attempt.comment ? attempt.comment : null,
        p_source: "web"
      }).then(function () {
        if (S.identity !== identity) return;
        S.confirmed[mid] = attempt;
        if (identity.kind === "manual" && !identity.confirmed) identity.confirmed = true;
        persistConfirmed();
        snack(TEXT.saved);
      }, function (error) {
        if (S.identity !== identity) return;
        fail(mid, attempt, error && error.code ? error.code : "network", error && error.detail);
      });
    });
  }

  function revert(mid, attempt) {
    if (S.answers[mid] !== attempt) return;
    if (S.confirmed[mid]) S.answers[mid] = S.confirmed[mid];
    else delete S.answers[mid];
    refresh(mid);
  }

  function fail(mid, attempt, code, detail) {
    var shown;
    // "Erneut" only resends while the shown answer is still the reverted one (no newer choice in between).
    var again = function () { if (S.online && S.answers[mid] === shown) commit(mid, attempt); };
    if (code === "meeting_closed") {
      revert(mid, attempt);
      S.closed[mid] = true;
      if (S.view === "answer") renderAnswer(false);
      snack(TEXT.closed);
    } else if (code === "meeting_unknown") {
      // A newer snapshot removed or replaced this match: hide it and load the current schedule.
      revert(mid, attempt);
      S.closed[mid] = true;
      if (S.view === "answer") renderAnswer(false);
      snack(TEXT.changed);
      silentRefresh(true);
    } else if (code === "player_unknown") {
      var id = S.identity;
      if (id.kind === "manual" && id.confirmed) {
        // The server no longer knows this manual person (e.g. old answers purged): send the full name once more.
        id.confirmed = false;
        persistConfirmed();
        commit(mid, attempt);
        return;
      }
      // The roster changed (person removed): load the current roster before asking again.
      revert(mid, attempt);
      clearIdentity();
      load(true).then(function () { if (S.view === "who") snack(TEXT.playerUnknown); });
    } else if (code === "manual_limit") {
      revert(mid, attempt);
      clearIdentity();
      renderWho(true);
      snack(TEXT.manualLimit);
    } else if (code === "poll_unknown") {
      renderUnknown();
    } else if (code === "invalid_answer") {
      // Retrying the same input cannot help.
      revert(mid, attempt);
      snack(TEXT.invalid);
      if (detail === "first_name" || detail === "last_name" || detail === "manual_id") { clearIdentity(); renderWho(true); }
    } else if (code === "poll_paused") {
      revert(mid, attempt);
      shown = S.answers[mid];
      snack(TEXT.paused, TEXT.retry, again);
    } else if (code === "poll_write_limit") {
      revert(mid, attempt);
      shown = S.answers[mid];
      snack(TEXT.writeLimit, TEXT.retry, again);
    } else {
      revert(mid, attempt);
      shown = S.answers[mid];
      snack(TEXT.notSaved, TEXT.retry, again);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Loading and routing

  function decide(focus) {
    var identity = validIdentity(S.store.identity);
    if (openMeetings().length === 0) { renderEnd(); return; }
    if (identity) { setIdentity(identity); renderAnswer(focus); }
    else { if (S.store.identity) { clearIdentity(); } renderWho(focus); }
  }

  function load(focus) {
    renderLoading();
    return rpc("get_poll", { p_public_id: PUBLIC_ID }).then(function (data) {
      var poll = Array.isArray(data) ? data[0] : data;
      if (isObject(poll) && poll.status === "unknown") { renderUnknown(); return; }
      var parsed = normalizePoll(data);
      if (!parsed) { renderLoadError(); return; }
      S.poll = parsed.poll;
      S.offset = parsed.offset;
      S.fetchedAt = Date.now();
      S.store = loadStore();
      decide(focus);
    }, function () { renderLoadError(); });
  }

  /** Silent refresh when the tab comes back after a while: new matches, changed times, new roster. */
  function silentRefresh(force) {
    if (!S.poll || !S.online || (force !== true && Date.now() - S.fetchedAt < REFRESH_AFTER_MS)) return;
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    S.fetchedAt = Date.now();
    rpc("get_poll", { p_public_id: PUBLIC_ID }).then(function (data) {
      var poll = Array.isArray(data) ? data[0] : data;
      if (isObject(poll) && poll.status === "unknown") { renderUnknown(); return; }
      var parsed = normalizePoll(data);
      if (!parsed || (document.activeElement && document.activeElement.tagName === "INPUT")) return;
      S.poll = parsed.poll;
      S.offset = parsed.offset;
      if (S.view === "answer" || S.view === "who" || S.view === "end") {
        // Keep the identity object itself: pending saves compare it and would otherwise be dropped.
        if (S.identity && validIdentity(S.identity)) { renderAnswer(false); return; }
        decide();
      }
    }, function () { /* keep the current page */ });
  }

  /** A match that starts while the page is open disappears (answers are only possible until kickoff). */
  function tick() {
    if (!S.poll || (S.view !== "answer" && S.view !== "who")) return;
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    if (openSignature() === S.openIds && S.view === "answer") return;
    if (S.view === "answer") renderAnswer(false);
    else if (openMeetings().length === 0) renderEnd();
  }

  function applyOnline() {
    S.online = navigator.onLine !== false;
    if (S.offlineEl) S.offlineEl.hidden = S.online;
    refreshAll();
    if (S.online && S.view === "error") load(false);
  }

  function init() {
    buildShell();
    if (!ID_OK) { renderUnknown(); return; }
    window.addEventListener("online", applyOnline);
    window.addEventListener("offline", applyOnline);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) silentRefresh(); });
    setInterval(tick, 30000);
    load(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
