/* Kort-ID backend per environment. Only public values belong here: the project ref and the publishable key
   (sb_publishable_..., public by design, RLS and RPC grants protect the data). NEVER put a secret key here.

   Path prefix /t/<token> = prod, /d/<token> = dev (see README.md).
   Availability page (season.js): /s/<id> = prod, /z/<id> = dev; the entries below are reused (s -> t, z -> d).
   The old poll paths /v/<id> and /w/<id> are a static notice and need no entry.
   Keep the CSP connect-src in 404.html in sync when a ref changes. */
window.LIGA_CONFIG = {
  t: { name: "prod", ref: "sjkoqqcpfwegmwzavida", key: "sb_publishable_U9ZPvxm3mBNHcQsyQWkYcw_hfx70qnx" },
  d: { name: "dev", ref: "pjccvfvaeyvqjldfwqje", key: "sb_publishable_XEYNBagKrxgkPbeQNuoWnQ_k7vOBJTJ" }
};
window.LIGA_CONFIG.s = window.LIGA_CONFIG.t; // availability page, prod
window.LIGA_CONFIG.z = window.LIGA_CONFIG.d; // availability page, dev
