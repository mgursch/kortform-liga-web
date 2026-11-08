/* Marks availability-poll paths (/v/<id> prod, /w/<id> dev) before the first paint, so CSS can hide the invite markup
   and the page title is right immediately. Must stay tiny, blocking and free of any logic beyond the path check. */
(function () {
  "use strict";
  if (/^\/[vw]\//.test(window.location.pathname)) {
    document.documentElement.className += " route-poll";
    document.title = "Verfügbarkeit · Kortform";
  }
}());
