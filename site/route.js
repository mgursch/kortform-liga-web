/* Marks the availability paths before the first paint, so CSS can hide the invite markup and the page title is right
   immediately: /s/<id> (prod) and /z/<id> (dev) = availability page (season.js), /v/<id> and /w/<id> = the old poll links,
   a static "ended" notice in 404.html. Must stay tiny, blocking and free of any logic beyond the path check. */
(function () {
  "use strict";
  var path = window.location.pathname;
  if (/^\/[sz]\//.test(path)) {
    document.documentElement.className += " route-season";
    document.title = "Verfügbarkeit · Kortform";
  } else if (/^\/[vw]\//.test(path)) {
    document.documentElement.className += " route-ended";
    document.title = "Abfrage beendet · Kortform";
  }
}());
