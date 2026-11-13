/* Availability page (served as 404.html for /s/<id> = prod and /z/<id> = dev, config.js).
   Players pick who they are, then enter per match whether they can play. Talks only to the three public RPCs
   get_avail_season, submit_avail_answer and confirm_avail_answer of the matching Supabase project (publishable key,
   role anon). No cookies, no analytics, no trackers, no logging. Local storage (kortform.avail.<public_id>) keeps only
   the chosen person key; every access is wrapped in try/catch and the page works without it. The public id and the
   person key never leave this page except in the RPC calls. No inline scripts or styles (CSP).
   The old poll paths /v/<id> and /w/<id> are a static notice in 404.html; this script stays out of their way. */
(function () {
  "use strict";

  var root = document.getElementById("season-view");
  var route = /^\/([sz])\/(.*)$/.exec(window.location.pathname);
  if (!root || !route) return; // not a season path: invite.js (or the static notice) handles the page

  var PREFIX = route[1];
  var PUBLIC_ID = route[2].replace(/\/$/, "");
  var ID_OK = /^[A-Za-z0-9]{12}$/.test(PUBLIC_ID);
  // Custom scheme per environment, same idea as invite.js: prod kortform://, dev kortform-dev://.
  var SCHEME = PREFIX === "z" ? "kortform-dev" : "kortform";
  var STORE_PLAY = "https://play.google.com/store/apps/details?id=com.swordistudios.kortform";
  var STORE_APPLE = "https://apps.apple.com/at/app/kortform-tennis-wertung/id6826770040";
  var PRIVACY_URL = "https://kortform.at/datenschutz/";
  var TIMEOUT_MS = 10000;
  var COMMENT_MAX = 60;
  var ROSTER_SEARCH_MIN = 11; // search field when more than 10 people
  var REFRESH_AFTER_MS = 5 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var REMIND_MS = 14 * DAY_MS; // reminder window and "confirmed" threshold: 14 days before kickoff
  var STORAGE_KEY = "kortform.avail." + PUBLIC_ID;

  var STATUS = {
    yes: { label: "Ja", icon: "check" },
    maybe: { label: "Vielleicht", icon: "maybe" },
    no: { label: "Nein", icon: "x" }
  };
  var ORDER = ["yes", "maybe", "no"];
  var SOURCE = { app: "App", web: "Web", captain: "Mannschaftsführung" };
  var MONTHS = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var DOW_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var DOW_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  var TEXT = {
    notFound: "Diesen Link kennen wir nicht. Er wurde vielleicht erneuert. Bitte frag deine Mannschaftsführung nach dem aktuellen Link.",
    expired: "Diese Saison ist zu Ende. Danke fürs Mitmachen!",
    loadError: "Die Seite konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es noch einmal.",
    otherError: "Das hat gerade nicht geklappt. Versuch es später noch einmal.",
    offline: "Keine Verbindung. Eintragen ist möglich, sobald du wieder online bist.",
    saved: "Gespeichert",
    confirmed: "Bestätigt",
    notSaved: "Nicht gespeichert – erneut versuchen",
    retry: "Erneut",
    paused: "Eintragen ist gerade nicht möglich. Bitte versuche es später noch einmal.",
    writeLimit: "Gerade sind zu viele Einträge unterwegs. Bitte versuche es in ein paar Minuten noch einmal.",
    closed: "Dieser Spieltag hat schon begonnen. Eintragen ist nicht mehr möglich.",
    cancelled: "Dieser Spieltag wurde abgesagt.",
    changed: "Der Spielplan hat sich geändert. Bitte prüfe deinen Eintrag.",
    personGone: "Du stehst nicht mehr im Kader dieser Mannschaft. Bitte wähle dich noch einmal aus.",
    noAnswer: "Du hast für diesen Spieltag noch nichts eingetragen.",
    invalid: "Nicht gespeichert. Bitte prüfe deine Eingabe.",
    unnamed: "Spieler*in ohne Namen"
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
    wifioff: ["M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-8.4-3.7M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.7-2", "M8.5 16.4a5 5 0 0 1 7 0", "M12 20h.01", "M3 3l18 18"],
    external: ["M14 4h6v6", "M20 4l-9 9", "M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"],
    info: ["c:12,12,10", "M12 11v5", "M12 8v.01"],
    bell: ["M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z", "M10 21h4"]
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

  function length(value) { return Array.from(value).length; }

  var uidCounter = 0;
  function uid(prefix) { uidCounter += 1; return prefix + uidCounter; }

  function parseMs(value) {
    var ms = typeof value === "string" ? Date.parse(value) : NaN;
    return isNaN(ms) ? null : ms;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dates (always Austrian time, like the league schedule, whatever the device time zone is)

  var viennaFormat = null;
  try {
    viennaFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch (e) { viennaFormat = null; }

  /** {y, m (1-12), d, dow (0 = Sunday), hh, mm} of an instant in Europe/Vienna (device time zone if Intl cannot). */
  function vienna(ms) {
    var date = new Date(ms);
    if (viennaFormat) {
      var parts = {};
      viennaFormat.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
      return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), dow: DOW_EN[parts.weekday], hh: Number(parts.hour) % 24, mm: Number(parts.minute) };
    }
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), dow: date.getDay(), hh: date.getHours(), mm: date.getMinutes() };
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dayNumber(p) { return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS); }

  /** Whole Austrian calendar days from `fromMs` to `toMs` (0 = same day, 1 = the next day). */
  function daysBetween(fromMs, toMs) { return dayNumber(vienna(toMs)) - dayNumber(vienna(fromMs)); }

  /** "Sa, 14.11." */
  function formatDate(ms) { var p = vienna(ms); return DOW_DE[p.dow] + ", " + p.d + "." + p.m + "."; }
  /** "14:00" */
  function formatTime(ms) { var p = vienna(ms); return pad2(p.hh) + ":" + pad2(p.mm); }
  /** "2026-11" and "November 2026" */
  function monthKey(ms) { var p = vienna(ms); return p.y + "-" + pad2(p.m); }
  function monthLabel(ms) { var p = vienna(ms); return MONTHS[p.m - 1] + " " + p.y; }

  /** "2.6. 18:04" for the history; the year only when it is not the current one. */
  function formatStamp(ms, nowMs) {
    var p = vienna(ms);
    var year = p.y === vienna(nowMs).y ? "" : p.y;
    return p.d + "." + p.m + "." + year + " " + pad2(p.hh) + ":" + pad2(p.mm);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // State

  var S = {
    data: null,            // normalized season: {season, meetings, roster, answers, history}
    offset: 0,             // server time minus device time, so a wrong device clock does not matter
    fetchedAt: 0,
    identity: null,        // person_key of the chosen roster person
    pending: {},           // optimistic own answers while a write is in flight: meetingId -> answer
    chain: Promise.resolve(), // all writes and refreshes run one after the other
    online: navigator.onLine !== false,
    view: "loading",
    openTeam: {},          // meetingId -> true: "Mannschaft" section expanded
    openComment: {},       // meetingId -> true: comment field expanded
    openPast: false,
    bannerEdit: null,      // meetingId whose answer the banner lets the player change
    sig: "",
    pointer: 0,            // time of the last pointerdown while a pointer is down (0 = none): do not replace the buttons under the finger
    renderPending: false,
    snackTimer: null,
    offlineEl: null
  };

  var el = {}; // shell elements

  // ---------------------------------------------------------------------------------------------------------------
  // Local storage: only the person key of this season (an unusable value is ignored)

  /** Same rule as the server's avail_person_key_ok: licence key or nu:<playerId>, no whitespace or control chars. */
  function keyOk(key) {
    if (typeof key !== "string") return false;
    var len = length(key);
    var bad = /[\s\u0000-\u001f\u007f-\u009f]/;
    if (key.slice(0, 3) === "nu:") return len >= 4 && len <= 64 && !bad.test(key.slice(3));
    return len >= 1 && len <= 64 && !bad.test(key) && !/^0+$/.test(key);
  }

  function loadIdentity() {
    try {
      var key = window.localStorage.getItem(STORAGE_KEY);
      return keyOk(key) ? key : null;
    } catch (e) { return null; /* storage unavailable: nothing remembered */ }
  }

  function saveIdentity(key) {
    try {
      if (key) window.localStorage.setItem(STORAGE_KEY, key);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
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

  /** Validates and normalizes get_avail_season; returns null for anything unexpected. */
  function normalize(data) {
    var d = Array.isArray(data) ? data[0] : data;
    if (!isObject(d)) return null;
    var serverMs = parseMs(d.server_time);
    var offset = serverMs === null ? 0 : serverMs - Date.now();
    if (d.status === "not_found" || d.status === "expired") return { status: d.status, offset: offset };
    if (d.status !== "ok" || !isObject(d.season)) return null;

    var meetings = [];
    (Array.isArray(d.meetings) ? d.meetings : []).forEach(function (m) {
      var startsMs = isObject(m) ? parseMs(m.starts_at) : null;
      if (startsMs === null || typeof m.meeting_id !== "string" || !m.meeting_id) return;
      meetings.push({
        id: m.meeting_id,
        startsMs: startsMs,
        round: typeof m.round === "number" ? m.round : null,
        home: m.is_home === true,
        opponent: str(m.opponent),
        address: str(m.address),
        cancelled: m.cancelled === true
      });
    });
    meetings.sort(function (a, b) { return a.startsMs - b.startsMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });

    var roster = [];
    (Array.isArray(d.roster) ? d.roster : []).forEach(function (p) {
      if (!isObject(p) || typeof p.person_key !== "string" || !p.person_key) return;
      roster.push({ key: p.person_key, first: str(p.first_name), last: str(p.last_name) });
    });

    var answers = {};
    (Array.isArray(d.answers) ? d.answers : []).forEach(function (a) {
      if (!isObject(a) || typeof a.meeting_id !== "string" || typeof a.person_key !== "string" || !STATUS[a.status]) return;
      if (!answers[a.meeting_id]) answers[a.meeting_id] = {};
      answers[a.meeting_id][a.person_key] = {
        status: a.status,
        comment: str(a.comment),
        source: typeof a.source === "string" ? a.source : "",
        answeredMs: parseMs(a.answered_at),
        confirmedMs: parseMs(a.confirmed_at)
      };
    });

    var history = {};
    (Array.isArray(d.own_history) ? d.own_history : []).forEach(function (e) {
      if (!isObject(e) || typeof e.meeting_id !== "string" || (e.kind !== "answer" && e.kind !== "confirm" && e.kind !== "remove")) return;
      if (!history[e.meeting_id]) history[e.meeting_id] = [];
      history[e.meeting_id].push({
        kind: e.kind,
        status: STATUS[e.status] ? e.status : null,
        comment: str(e.comment),
        source: typeof e.source === "string" ? e.source : "",
        ms: parseMs(e.created_at)
      });
    });

    var s = d.season;
    return {
      status: "ok",
      offset: offset,
      season: { team: str(s.team_name), club: str(s.club_name), name: str(s.season_name), group: str(s.group_name) },
      meetings: meetings,
      roster: roster,
      answers: answers,
      history: history
    };
  }

  /** Asks the server for the season; a rejected person key is dropped and the call repeated once without it. */
  function fetchSeason(key) {
    return rpc("get_avail_season", { p_public_id: PUBLIC_ID, p_person_key: key || null }).then(normalize, function (error) {
      if (key && error && error.code === "invalid_argument") {
        saveIdentity(null);
        S.identity = null;
        return rpc("get_avail_season", { p_public_id: PUBLIC_ID, p_person_key: null }).then(normalize);
      }
      throw error;
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Derived data

  function now() { return Date.now() + S.offset; }

  var collator = (function () { try { return new Intl.Collator("de", { sensitivity: "base" }); } catch (e) { return null; } }());
  function compare(a, b) { return collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }

  function hasName(p) { return !!(p.first || p.last); }
  function displayName(p) { return [p.last, p.first].filter(Boolean).join(" "); }

  /** Roster by name ("Nachname Vorname", the league convention), people without a name last (stable by key).
      Sets `label` on every person: the name, or a neutral text (numbered when several are unnamed); the key is never shown. */
  function sortedRoster() {
    var list = S.data.roster.slice().sort(function (a, b) {
      if (hasName(a) !== hasName(b)) return hasName(a) ? -1 : 1;
      return compare(displayName(a), displayName(b)) || compare(a.key, b.key);
    });
    var unnamed = list.filter(function (p) { return !hasName(p); }).length;
    var n = 0;
    list.forEach(function (p) {
      if (hasName(p)) p.label = displayName(p);
      else { n += 1; p.label = unnamed > 1 ? TEXT.unnamed + " (" + n + ")" : TEXT.unnamed; }
    });
    return list;
  }

  function rosterPerson(key) {
    var list = sortedRoster();
    return list.filter(function (p) { return p.key === key; })[0] || null;
  }

  function initials(p) {
    var a = Array.from(p.last || "")[0] || "";
    var b = Array.from(p.first || "")[0] || "";
    return (a + b).toUpperCase() || "?";
  }

  function normalizeForSearch(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /** The own answer, including a write that is still in flight. */
  function ownAnswer(mid) {
    if (S.pending[mid]) return S.pending[mid];
    var byPerson = S.data.answers[mid];
    return byPerson && S.identity ? byPerson[S.identity] || null : null;
  }

  /** The answer of a person; the own one includes the pending write. */
  function answerOf(mid, key) {
    if (key === S.identity) return ownAnswer(mid);
    var byPerson = S.data.answers[mid];
    return byPerson ? byPerson[key] || null : null;
  }

  /** Confirmed = the last confirmation (an answer counts as one) is not older than 14 days before kickoff. */
  function isConfirmed(meeting, answer) {
    if (!answer) return false;
    var ms = answer.confirmedMs !== null ? answer.confirmedMs : answer.answeredMs;
    return ms !== null && ms >= meeting.startsMs - REMIND_MS;
  }

  function isPast(meeting) { return meeting.startsMs <= now(); }

  /** Meetings that are due for the reminder: not cancelled, inside the 14 days before kickoff (starts_at - 14 days <= now
      < starts_at, server time), and no answer yet ("missing") or an answer last confirmed earlier than 14 days before
      kickoff ("changed"). Earliest first. */
  function dueMeetings() {
    var t = now();
    var out = [];
    S.data.meetings.forEach(function (m) {
      if (m.cancelled || t >= m.startsMs || t < m.startsMs - REMIND_MS) return;
      var answer = ownAnswer(m.id);
      if (!answer) out.push({ meeting: m, kind: "missing" });
      else if (!isConfirmed(m, answer)) out.push({ meeting: m, kind: "changed" });
    });
    return out;
  }

  function stateSig() {
    var due = dueMeetings().map(function (d) { return d.meeting.id + ":" + d.kind; }).join("|");
    return due + "#" + S.data.meetings.filter(isPast).length;
  }

  function setTitle(part) { document.title = (part ? part + " · " : "") + "Kortform"; }

  /** The element with this data-fid (ids contain meeting ids, so no attribute selector). */
  function byFid(id) {
    var found = null;
    Array.prototype.forEach.call(el.col.querySelectorAll("[data-fid]"), function (node) { if (!found && node.getAttribute("data-fid") === id) found = node; });
    return found;
  }

  /** Moves the focus to the element with this data-fid (after a render that replaced the one that had it). */
  function focusFid(id, scroll) {
    var node = byFid(id);
    if (node && !node.disabled) node.focus({ preventScroll: !scroll });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Shell: header, content column, aside, footer, snackbar

  function buildShell() {
    clear(root);
    var openApp = ID_OK ? h("a", { class: "btn btn-small", href: SCHEME + "://avail/" + PUBLIC_ID, text: "In der App öffnen" }) : null;

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
        h("p", { text: "Jede Auswahl wird sofort gespeichert. Du kannst sie bis zum Spielbeginn jederzeit ändern. Die Mannschaft sieht, wer Zeit hat." })));
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
    S.snackTimer = setTimeout(hideSnack, actionLabel ? 9000 : 4000);
  }

  function hideSnack() { clearTimeout(S.snackTimer); el.snack.hidden = true; }

  /** Switches the content column to another view (scrolls to the top). */
  function show(view) {
    S.view = view;
    S.offlineEl = null;
    S.renderPending = false;
    el.aside.hidden = view !== "season";
    clear(el.col);
    window.scrollTo(0, 0);
  }

  function focusHeading() {
    var heading = el.col.querySelector("[data-focus]");
    if (heading) heading.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Plain message views

  function renderLoading() {
    show("loading");
    el.col.appendChild(h("div", { class: "pv-loading" }, h("div", { class: "spinner", role: "status", "aria-label": "Seite wird geladen" })));
  }

  function renderMessage(view, title, text, iconName, button) {
    show(view);
    setTitle(title);
    el.col.appendChild(h("div", { class: "pv-message" },
      h("span", { class: "pv-message-icon", "aria-hidden": "true" }, icon(iconName, 44, 1.8)),
      h("p", { text: text, tabindex: "-1", "data-focus": "" }),
      button));
    focusHeading();
  }

  function renderNotFound() { renderMessage("notfound", "Link nicht gefunden", TEXT.notFound, "info"); }
  function renderExpired() { renderMessage("expired", "Saison beendet", TEXT.expired, "check"); }

  /** `error`: the RpcError of the failed call; only a network failure (or being offline) blames the connection. */
  function renderLoadError(error) {
    var network = !S.online || (error && error.code === "network");
    var retry = h("button", { type: "button", class: "btn btn-large", text: "Erneut versuchen", onclick: function () { load(); } });
    renderMessage("error", "Seite nicht geladen", network ? TEXT.loadError : TEXT.otherError, network ? "wifioff" : "info", retry);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Header block of the season (club, season, group)

  function seasonInfo() {
    var s = S.data.season;
    return [s.club, s.name, s.group].filter(Boolean).join(" · ");
  }

  // ---------------------------------------------------------------------------------------------------------------
  // "Wer bist du?"

  function renderWho(focus) {
    show("who");
    setTitle("Wer bist du?");
    var roster = sortedRoster();
    var list = h("ul", { class: "pv-people" });
    var none = h("p", { class: "pv-none", text: "Keine Treffer.", hidden: true });

    function fill(query) {
      var q = normalizeForSearch(query.trim());
      clear(list);
      var count = 0;
      roster.forEach(function (p) {
        if (q && normalizeForSearch(p.last + " " + p.first).indexOf(q) < 0 && normalizeForSearch(p.first + " " + p.last).indexOf(q) < 0 && normalizeForSearch(p.label).indexOf(q) < 0) return;
        count += 1;
        list.appendChild(h("li", null,
          h("button", { type: "button", class: "pv-person", onclick: function () { choosePerson(p.key); } },
            h("span", { class: "pv-avatar", "aria-hidden": "true", text: initials(p) }),
            h("span", { class: "pv-person-name", text: p.label }))));
      });
      none.hidden = !(q && count === 0);
    }

    var search = null;
    if (roster.length >= ROSTER_SEARCH_MIN) {
      var input = h("input", { type: "search", placeholder: "Name suchen", "aria-label": "Name suchen", autocomplete: "off", enterkeyhint: "search", oninput: function () { fill(input.value); } });
      search = h("label", { class: "pv-search" }, icon("search", 24), input);
    }

    put(el.col,
      h("p", { class: "pv-eyebrow", text: [S.data.season.team, seasonInfo()].filter(Boolean).join(" · ") }),
      h("h1", { class: "pv-h1", text: "Wer bist du?", tabindex: "-1", "data-focus": "" }),
      roster.length === 0 ? h("p", { class: "pv-lede", text: "Für diese Mannschaft ist noch kein Kader eingetragen. Bitte frag deine Mannschaftsführung." }) : null,
      search,
      list,
      none,
      roster.length > 0 ? h("p", { class: "pv-lede", text: "Du stehst nicht in der Liste? Dann frag deine Mannschaftsführung." }) : null);
    fill("");
    if (focus) focusHeading();
  }

  function choosePerson(key) {
    S.identity = key;
    S.pending = {};
    S.bannerEdit = null;
    saveIdentity(key);
    renderSeason({ view: true, focus: true });
    queueRefetch(); // loads the own history
  }

  function changePerson() {
    S.identity = null;
    S.pending = {};
    S.bannerEdit = null;
    saveIdentity(null);
    renderWho(true);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Season view

  function mapsLink(address) {
    return h("a", { class: "pv-map", href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address), target: "_blank", rel: "noopener noreferrer" },
      icon("pin", 16), address);
  }

  function meetingLabel(m) { return formatDate(m.startsMs) + " " + formatTime(m.startsMs) + (m.opponent ? " gegen " + m.opponent : ""); }

  /** Ja / Vielleicht / Nein as a toggle group; `fid` prefixes the focus ids so a re-render can restore the focus. */
  function answerGroup(label, current, fid, onPick) {
    var group = h("div", { class: "pv-seg", role: "group", "aria-label": label });
    ORDER.forEach(function (status) {
      var on = current === status;
      group.appendChild(h("button", { type: "button", "aria-pressed": on ? "true" : "false", disabled: !S.online, "data-fid": fid + status, onclick: function () { onPick(status); } },
        h("span", { class: "pv-seg-icon", hidden: !on }, icon(STATUS[status].icon, 16, 2.6)), STATUS[status].label));
    });
    return group;
  }

  function pick(mid, status) {
    if (!S.online || !S.identity) return;
    var current = ownAnswer(mid);
    if (current && current.status === status) { S.bannerEdit = null; renderSeason({}); return; }
    S.bannerEdit = null;
    submit(mid, status, current ? current.comment : "");
  }

  /** The reminder on top: the earliest due meeting, same logic as the app. Hidden when nothing is due. */
  function renderBanner() {
    var due = dueMeetings();
    if (!due.length) return null;
    var first = due[0];
    var m = first.meeting;
    var days = daysBetween(now(), m.startsMs);
    var lead = "Nächstes Match " + (days <= 0 ? "ist heute" : days === 1 ? "ist morgen" : "in " + days + " Tagen") + ".";
    var answer = ownAnswer(m.id);
    var label = "Antwort für " + meetingLabel(m);
    var fid = "b:" + m.id + ":";
    var body;
    var actions;
    if (first.kind === "missing") {
      body = "Du hast noch nicht eingetragen, ob du Zeit hast.";
      actions = answerGroup(label, null, fid, function (status) { pick(m.id, status); });
    } else if (S.bannerEdit === m.id) {
      body = "Wie sieht es jetzt aus?";
      actions = h("div", { class: "pv-banner-edit" },
        answerGroup(label, answer.status, fid, function (status) {
          // Tapping the answer that is already selected confirms it, like "Passt noch".
          if (status === answer.status) { S.bannerEdit = null; confirmAnswer(m.id); } else pick(m.id, status);
        }),
        h("button", { type: "button", class: "pv-linkbtn", "data-fid": fid + "back", text: "Abbrechen", onclick: function () { S.bannerEdit = null; renderSeason({}); focusFid(fid + "change"); } }));
    } else {
      body = "Hat sich deine Verfügbarkeit geändert?";
      actions = h("div", { class: "pv-banner-buttons" },
        h("button", { type: "button", class: "pv-solid-btn", disabled: !S.online, "data-fid": fid + "confirm", text: "Passt noch", onclick: function () { confirmAnswer(m.id); } }),
        h("button", { type: "button", class: "pv-outline-btn", disabled: !S.online, "data-fid": fid + "change", text: "Ändern", onclick: function () { S.bannerEdit = m.id; renderSeason({}); focusFid(fid + answer.status); } }));
    }
    var when = formatDate(m.startsMs) + " · " + formatTime(m.startsMs) + (m.opponent ? " · " + m.opponent : "") +
      (first.kind === "changed" ? " · Deine Antwort: " + STATUS[answer.status].label : "");
    return h("section", { class: "pv-remind", "aria-label": "Erinnerung" },
      h("div", { class: "pv-remind-head" }, icon("bell", 20), h("span", { text: lead + " " + body })),
      h("div", { class: "pv-remind-when", text: when }),
      actions,
      due.length > 1 ? h("p", { class: "pv-remind-more", text: "+ " + (due.length - 1) + (due.length === 2 ? " weiterer Spieltag" : " weitere Spieltage") + " fällig, siehe Liste unten." }) : null);
  }

  /** Comment of an own answer: a button that opens the field; the field saves when it loses focus. */
  function commentBlock(m, answer) {
    var open = !!S.openComment[m.id];
    var hintId = uid("pv-hint-");
    var countId = uid("pv-count-");
    var input = h("input", { type: "text", maxlength: String(COMMENT_MAX), placeholder: "z. B. erst ab 14 Uhr", autocomplete: "off", enterkeyhint: "done", disabled: !answer || !S.online,
      "aria-describedby": hintId + " " + countId, value: answer ? answer.comment : "", "data-fid": "c:" + m.id });
    var count = h("span", { class: "pv-count", id: countId, text: (answer ? length(answer.comment) : 0) + "/" + COMMENT_MAX });
    input.addEventListener("input", function () { count.textContent = length(input.value) + "/" + COMMENT_MAX; });
    input.addEventListener("change", function () {
      var value = cut(clean(input.value), COMMENT_MAX);
      var current = ownAnswer(m.id);
      if (!current || !S.online || value === current.comment) { input.value = current ? current.comment : ""; return; }
      submit(m.id, current.status, value);
    });
    input.addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); input.blur(); } });

    var toggle = h("button", { type: "button", class: "pv-pen", "aria-expanded": open ? "true" : "false", "data-fid": "p:" + m.id, onclick: function () {
      S.openComment[m.id] = !S.openComment[m.id];
      renderSeason({});
      if (S.openComment[m.id]) focusFid("c:" + m.id, true);
    } }, icon("pen", 18), answer && answer.comment ? "Kommentar ändern" : "Kommentar");

    return {
      toggle: toggle,
      shown: answer && answer.comment && !open ? h("p", { class: "pv-comment", text: "„" + answer.comment + "“" }) : null,
      field: open ? h("div", { class: "pv-fieldwrap" },
        h("label", { class: "pv-field" }, h("span", { class: "pv-float", text: "Kommentar (optional)" }), input),
        h("div", { class: "pv-hintrow" }, h("span", { id: hintId, text: answer ? "Nur deine Mannschaftsführung sieht deinen Kommentar." : "Wähle zuerst eine Antwort." }), count)) : null
    };
  }

  /** "Ja · Web · 2.6. 18:04" */
  function historyLine(e) {
    var what = e.kind === "confirm" ? "bestätigt" : e.kind === "remove" ? "entfernt" : STATUS[e.status] ? STATUS[e.status].label : "Antwort";
    var parts = [what];
    if (e.source) parts.push(SOURCE[e.source] || e.source);
    if (e.ms !== null) parts.push(formatStamp(e.ms, now()));
    var text = parts.join(" · ");
    if (e.kind === "answer" && e.comment) text += " „" + e.comment + "“";
    return text;
  }

  /** Collapsible "Mannschaft": counts and names grouped Ja / Vielleicht / Nein / offen, plus the own history. */
  function teamSection(m) {
    var roster = sortedRoster();
    var groups = { yes: [], maybe: [], no: [], open: [] };
    roster.forEach(function (p) {
      var a = answerOf(m.id, p.key);
      groups[a ? a.status : "open"].push({ person: p, answer: a });
    });
    var summary = ORDER.map(function (s) { return groups[s].length + " " + STATUS[s].label; }).concat([groups.open.length + " offen"]).join(" · ");
    var body = h("div", { class: "pv-team-body" });
    ORDER.concat(["open"]).forEach(function (key) {
      if (!groups[key].length) return;
      var name = key === "open" ? "Offen" : STATUS[key].label;
      body.appendChild(h("div", { class: "pv-group" },
        h("div", { class: "pv-group-label", text: name + " (" + groups[key].length + ")" }),
        h("ul", { class: "pv-names" }, groups[key].map(function (entry) {
          return h("li", null,
            h("span", { text: entry.person.label + (entry.person.key === S.identity ? " (du)" : "") }));
        }))));
    });
    if (!roster.length) body.appendChild(h("p", { class: "pv-none", text: "Noch kein Kader eingetragen." }));

    var events = S.data.history[m.id] || [];
    if (events.length) {
      body.appendChild(h("div", { class: "pv-group" },
        h("div", { class: "pv-group-label", text: "Dein Verlauf" }),
        h("ol", { class: "pv-history" }, events.map(function (e) { return h("li", { text: historyLine(e) }); }))));
    }

    var details = h("details", { class: "pv-team", open: !!S.openTeam[m.id] },
      h("summary", { "data-fid": "t:" + m.id },
        h("span", { class: "pv-team-title", text: "Mannschaft" }),
        h("span", { class: "pv-team-sum", text: summary })),
      body);
    details.addEventListener("toggle", function () { S.openTeam[m.id] = details.open; });
    return details;
  }

  function meetingItem(m, past) {
    var answer = ownAnswer(m.id);
    var label = meetingLabel(m);

    var head = h("div", { class: "pv-meet-head" },
      h("span", { class: "pv-when", text: formatDate(m.startsMs) + " · " + formatTime(m.startsMs) }),
      m.round !== null ? h("span", { class: "pv-r", text: "Runde " + m.round }) : null,
      m.cancelled ? h("span", { class: "pv-chip cancelled", text: "Abgesagt" }) : null);
    var vs = h("div", { class: "pv-vs" },
      h("span", { class: "pv-chip" + (m.home ? " home" : ""), text: m.home ? "Heim" : "Auswärts" }),
      h("span", { class: "pv-vs-name", text: m.opponent ? "gegen " + m.opponent : "Gegner offen" }));

    var own = null;
    var comment = null;
    if (!m.cancelled && past) {
      own = h("p", { class: "pv-own", text: answer ? "Deine Antwort: " + STATUS[answer.status].label + (answer.comment ? " „" + answer.comment + "“" : "") : "Keine Antwort eingetragen" });
    } else if (!m.cancelled) {
      own = h("div", { class: "pv-own-row" },
        answerGroup("Antwort für " + label, answer ? answer.status : null, "a:" + m.id + ":", function (status) { pick(m.id, status); }),
        isConfirmed(m, answer) ? h("span", { class: "pv-confirmed", text: "bestätigt" }) : null);
      comment = commentBlock(m, answer);
    }

    return h("li", { class: "pv-meet" + (m.cancelled ? " is-cancelled" : "") + (past ? " is-past" : "") },
      h("div", { class: "pv-meet-info" }, head, vs, m.address ? mapsLink(m.address) : null),
      own,
      comment ? [comment.toggle, comment.shown, comment.field] : null,
      m.cancelled ? null : teamSection(m));
  }

  /** Meetings grouped by month under month headings. */
  function monthGroups(meetings, past) {
    var out = [];
    var lastKey = null;
    var list = null;
    meetings.forEach(function (m) {
      var key = monthKey(m.startsMs);
      if (key !== lastKey) {
        list = h("ul", { class: "pv-meets" });
        out.push(h("section", { class: "pv-month" }, h("h2", { class: "pv-month-label", text: monthLabel(m.startsMs) }), list));
        lastKey = key;
      }
      list.appendChild(meetingItem(m, past));
    });
    return out;
  }

  /** Renders the season view. opts.view: the view changed (scroll to the top); opts.focus: focus the heading.
      While someone types or a finger is down the render waits, so no button or field disappears under the input. */
  function renderSeason(opts) {
    opts = opts || {};
    var active = document.activeElement;
    var typing = !!active && active.tagName === "INPUT" && el.col.contains(active);
    if (!opts.view && (typing || pointerDown())) { S.renderPending = true; return; }
    var restoreId = !opts.view && active && active !== document.body && el.col.contains(active) ? active.getAttribute("data-fid") : null;
    var scrollY = window.scrollY;

    if (opts.view || S.view !== "season") show("season");
    else { S.offlineEl = null; S.renderPending = false; clear(el.col); }
    setTitle(S.data.season.team || "Verfügbarkeit");
    S.sig = stateSig();

    var person = rosterPerson(S.identity);
    var upcoming = S.data.meetings.filter(function (m) { return !isPast(m); });
    var past = S.data.meetings.filter(isPast);

    S.offlineEl = h("div", { class: "pv-offline", role: "status", hidden: S.online }, icon("wifioff", 20), h("span", { text: TEXT.offline }));

    put(el.col,
      h("h1", { class: "pv-title", text: S.data.season.team || "Verfügbarkeit", tabindex: "-1", "data-focus": "" }),
      seasonInfo() ? h("p", { class: "pv-sub", text: seasonInfo() }) : null,
      h("p", { class: "pv-sub" },
        "Du bist " + (person ? person.label : "") + " · ",
        h("button", { type: "button", class: "pv-linkbtn", "data-fid": "change-person", text: "Nicht du? Person wechseln", onclick: changePerson })),
      h("p", { class: "pv-sub", text: "Alle Spieler*innen der Mannschaft sehen deine Antworten." }),
      S.offlineEl,
      renderBanner());

    if (upcoming.length) put(el.col, monthGroups(upcoming, false));
    else put(el.col, h("p", { class: "pv-none", text: past.length ? "Keine kommenden Spieltage." : "Noch keine Spieltage eingetragen." }));

    if (past.length) {
      var pastDetails = h("details", { class: "pv-past", open: S.openPast },
        h("summary", { "data-fid": "past" }, "Vergangene Spieltage (" + past.length + ")"),
        monthGroups(past, true));
      pastDetails.addEventListener("toggle", function () { S.openPast = pastDetails.open; });
      put(el.col, pastDetails);
    }

    if (opts.view) {
      if (opts.focus) focusHeading();
      return;
    }
    window.scrollTo(0, scrollY);
    var target = restoreId ? byFid(restoreId) : null;
    if (target && !target.disabled) target.focus({ preventScroll: true });
    else if (restoreId) focusHeading();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Writing (answers and confirmations run one after the other, each followed by a fresh get_avail_season)

  function enqueue(job) {
    S.chain = S.chain.then(job, job).then(null, function () { /* every job handles its own errors */ });
    return S.chain;
  }

  /** Re-reads the season after a write; failures keep the page as it is. */
  function refetchNow(key) {
    return fetchSeason(key).then(function (parsed) {
      if (!parsed || S.identity !== key) return;
      S.offset = parsed.offset;
      S.fetchedAt = Date.now();
      applyParsed(parsed, false);
    }, function () { /* keep the current page */ });
  }

  function queueRefetch() {
    var key = S.identity;
    enqueue(function () { return S.online && key && S.identity === key ? refetchNow(key) : null; });
  }

  /** Saves an answer: shown at once, sent in order, followed by a re-fetch; springs back when it fails. */
  function submit(mid, status, comment) {
    var key = S.identity;
    var t = now();
    var overlay = { status: status, comment: comment, source: "web", answeredMs: t, confirmedMs: t };
    S.pending[mid] = overlay;
    renderSeason({});
    var run = function () {
      if (S.identity !== key) return null; // person changed meanwhile: drop
      return rpc("submit_avail_answer", {
        p_public_id: PUBLIC_ID,
        p_meeting_id: mid,
        p_person_key: key,
        p_status: status,
        p_comment: comment ? comment : null,
        p_source: "web"
      }).then(function () {
        if (S.identity !== key) return null;
        snack(TEXT.saved);
        return refetchAfterWrite(mid, overlay, key);
      }, function (error) { return writeFailed(error, mid, overlay, key, run); });
    };
    enqueue(run);
  }

  /** Confirms the current answer ("Passt noch"). */
  function confirmAnswer(mid) {
    var key = S.identity;
    var current = ownAnswer(mid);
    if (!current || !S.online) return;
    var overlay = { status: current.status, comment: current.comment, source: current.source, answeredMs: current.answeredMs, confirmedMs: now() };
    S.pending[mid] = overlay;
    renderSeason({});
    var run = function () {
      if (S.identity !== key) return null;
      return rpc("confirm_avail_answer", {
        p_public_id: PUBLIC_ID,
        p_meeting_id: mid,
        p_person_key: key,
        p_source: "web"
      }).then(function () {
        if (S.identity !== key) return null;
        snack(TEXT.confirmed);
        return refetchAfterWrite(mid, overlay, key);
      }, function (error) { return writeFailed(error, mid, overlay, key, run); });
    };
    enqueue(run);
  }

  /** The write worked: the written value is patched into the loaded data, so it stays visible if the re-fetch fails. */
  function refetchAfterWrite(mid, overlay, key) {
    if (!S.data.answers[mid]) S.data.answers[mid] = {};
    S.data.answers[mid][key] = overlay;
    if (S.pending[mid] === overlay) delete S.pending[mid];
    renderSeason({});
    return refetchNow(key);
  }

  /** Maps the error code of a failed write to a friendly message; "Erneut" is offered where sending again can help. */
  function writeFailed(error, mid, overlay, key, retry) {
    if (S.identity !== key) return null;
    if (S.pending[mid] === overlay) delete S.pending[mid];
    var code = error && error.code ? error.code : "network";
    var again = function () { if (S.online && S.identity === key) enqueue(retry); };
    var message;
    var offerRetry = false;
    var reload = false;
    if (code === "meeting_closed") { message = TEXT.closed; reload = true; }
    else if (code === "meeting_cancelled") { message = TEXT.cancelled; reload = true; }
    else if (code === "meeting_unknown") { message = TEXT.changed; reload = true; }
    else if (code === "no_answer") { message = TEXT.noAnswer; reload = true; }
    else if (code === "person_unknown" || code === "person_removed") {
      S.identity = null;
      S.pending = {};
      saveIdentity(null);
      return fetchSeason(null).then(function (parsed) {
        if (parsed) { S.offset = parsed.offset; applyParsed(parsed, true); }
        else renderLoadError();
        snack(TEXT.personGone);
      }, function (error) { renderLoadError(error); });
    } else if (code === "season_unknown") { renderNotFound(); return null; }
    else if (code === "season_expired") { renderExpired(); return null; }
    else if (code === "avail_paused") { message = TEXT.paused; offerRetry = true; }
    else if (code === "avail_write_limit") { message = TEXT.writeLimit; offerRetry = true; }
    else if (code === "invalid_answer" || code === "invalid_argument") { message = TEXT.invalid; }
    else { message = TEXT.notSaved; offerRetry = true; }

    renderSeason({});
    if (offerRetry) snack(message, TEXT.retry, again); else snack(message);
    return reload ? refetchNow(key) : null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Loading and routing

  /** Puts a fetched season on screen: a status view, "Wer bist du?" or the season. */
  function applyParsed(parsed, focus) {
    if (parsed.status === "not_found") { renderNotFound(); return; }
    if (parsed.status === "expired") { renderExpired(); return; }
    S.data = parsed;
    var gone = false;
    if (S.identity && !parsed.roster.some(function (p) { return p.key === S.identity; })) {
      // The person is no longer on the roster: forget it.
      S.identity = null;
      S.pending = {};
      saveIdentity(null);
      gone = true;
    }
    if (S.identity) renderSeason({ view: S.view !== "season", focus: focus });
    else renderWho(focus);
    if (gone) snack(TEXT.personGone);
  }

  function load() {
    renderLoading();
    S.identity = loadIdentity();
    return fetchSeason(S.identity).then(function (parsed) {
      if (!parsed) { renderLoadError(); return; }
      S.offset = parsed.offset;
      S.fetchedAt = Date.now();
      applyParsed(parsed, false);
    }, function (error) { renderLoadError(error); });
  }

  /** Silent refresh when the tab comes back after a while: new matches, changed times, new answers of the team. */
  function silentRefresh() {
    if (!S.data || !S.online || Date.now() - S.fetchedAt < REFRESH_AFTER_MS) return;
    if (S.view !== "season" && S.view !== "who") return;
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    var key = S.identity;
    S.fetchedAt = Date.now();
    enqueue(function () {
      return fetchSeason(key).then(function (parsed) {
        if (!parsed || S.identity !== key) return;
        if (document.activeElement && document.activeElement.tagName === "INPUT") return;
        S.offset = parsed.offset;
        applyParsed(parsed, false);
      }, function () { /* keep the current page */ });
    });
  }

  /** A match that starts while the page is open moves to the past; a reminder can become due. */
  function tick() {
    if (!S.data || S.view !== "season") return;
    if (stateSig() !== S.sig) renderSeason({});
  }

  function applyOnline() {
    S.online = navigator.onLine !== false;
    if (S.offlineEl) S.offlineEl.hidden = S.online;
    if (S.view === "season") renderSeason({});
    if (S.online && S.view === "error") load();
  }

  /** A pointer counts as down for at most 2 s, so a lost pointerup cannot block rendering for good. */
  function pointerDown() { return S.pointer > 0 && Date.now() - S.pointer < 2000; }

  function flushRender(delay) {
    setTimeout(function () { if (S.renderPending && !pointerDown() && S.view === "season") renderSeason({}); }, delay);
  }

  function init() {
    buildShell();
    if (!ID_OK) { renderNotFound(); return; }
    window.addEventListener("online", applyOnline);
    window.addEventListener("offline", applyOnline);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) silentRefresh(); });
    document.addEventListener("pointerdown", function () { S.pointer = Date.now(); }, true);
    var up = function () { S.pointer = 0; flushRender(300); };
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("focusout", function () { if (S.renderPending && !pointerDown()) flushRender(0); });
    setInterval(tick, 30000);
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}());
