/* Kort-ID backend per environment. Only public values belong here: the project ref and the publishable key
   (sb_publishable_..., public by design, RLS and RPC grants protect the data). NEVER put a secret key here.

   Path prefix /t/<token> = prod, /d/<token> = dev (see README.md).
   PROD_* are placeholders until the prod project exists (WP4). While a placeholder is set, the invite page shows the
   generic "open in the app" page without a preview. Also update the CSP connect-src in 404.html. */
window.LIGA_CONFIG = {
  t: { name: "prod", ref: "PROD_REF_TBD", key: "PROD_PUBLISHABLE_KEY_TBD" },
  d: { name: "dev", ref: "pjccvfvaeyvqjldfwqje", key: "sb_publishable_XEYNBagKrxgkPbeQNuoWnQ_k7vOBJTJ" }
};
