"use strict";
/* ===================== UI glue (loads last) =====================
   Explanations on/off with per-panel ⓘ, battery saver, phone notifications, home-screen app support. */
ST.notes = LS.get("notes", false); ST.lite = LS.get("lite", false);
function applyUi() { document.body.classList.toggle("notes", !!ST.notes); document.body.classList.toggle("lite", !!ST.lite); }
applyUi(); syncCtl();
// speed: sources that only feed one view refresh only while that view is open
["cbS", "krS", "bsS", "okS", "bgS", "gmS", "mxS", "dbFut"].forEach((id) => { if (SRC[id]) SRC[id].when = () => ST.tab === "mkts"; });
if (SRC.sess30) SRC.sess30.when = () => ST.tab === "sess";
function askNotif() {
  const off = (msg) => { ST.sigNotif = false; LS.set("sigNotif", false); syncCtl(); if (msg) sigToast({ dir: 0, kind: "info", txt: msg }); };
  if (!("Notification" in window)) return off("Notifications aren't available here. On iPhone, add the dashboard to your Home Screen (Share → Add to Home Screen), open it from there, then turn this on.");
  Notification.requestPermission().then((p) => { if (p !== "granted") off("Notifications were not allowed. You can allow them in Settings → Notifications."); });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tog]"); if (b) { const k = b.dataset.tog; if (k === "notes" || k === "lite") applyUi(); if (k === "sigNotif" && ST.sigNotif) askNotif(); }
  const i = e.target.closest(".ib"); if (i) { const p = i.closest(".panel"); if (p) p.classList.toggle("showsrc"); }
});
// ⓘ on every panel that has small print
function addInfo() {
  document.querySelectorAll(".view:not([hidden]) .panel").forEach((p) => {
    if (p.dataset.ib || !p.querySelector(".src")) return; const ph = p.querySelector(".ph"); if (!ph) return;
    const b = document.createElement("button"); b.className = "ib"; b.type = "button"; b.textContent = "i"; b.title = "What this shows"; b.setAttribute("aria-label", "What this shows");
    ph.appendChild(b); p.dataset.ib = "1";
  });
}
const _dUi = drawStage2;
drawStage2 = function (tab) { _dUi(tab); try { addInfo(); } catch (e) {} };
// home-screen app: a service worker is needed for notifications on iPhone. It doesn't cache anything.
if ("serviceWorker" in navigator && /^https:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
render(true);
