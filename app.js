/* Clipboard Guard — static PWA (web conversion of a SwiftUI app).
 *
 * IMPORTANT: Everything here is COSMETIC / LOCAL ONLY.
 * The browser cannot monitor or auto-clear the system clipboard in the background.
 * "Clear now" is a best-effort navigator.clipboard.writeText('') that may need a
 * user gesture or permission. The history and preferences are local only.
 * Data persists in localStorage only. No network calls (CSP connect-src 'none'),
 * no analytics, no tracking, no third-party code.
 */

// ===== PASSCODE (change here) =====
const PASSCODE = "6767";
// ==================================

const decoyEl = document.getElementById("decoy");
const lockEl = document.getElementById("lock");
const panelEl = document.getElementById("panel");
const dotsEl = document.getElementById("dots");
const errorEl = document.getElementById("lockError");
const keypadEl = document.getElementById("keypad");
const lockPanelBtn = document.getElementById("lockPanelBtn");
const decoyTimeEl = document.getElementById("decoyTime");
const decoyDateEl = document.getElementById("decoyDate");

let entered = "";
let view = "decoy"; // decoy | lock | panel

/* ---------- localStorage helpers (UserDefaults -> localStorage) ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function saveJSON(key, value) {
  // Local only — never sent anywhere.
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private */ }
}
function isoNow() { return new Date().toISOString(); }

function renderLog(listEl, lines, emptyText) {
  listEl.textContent = "";
  if (!lines.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText || "No entries yet";
    listEl.appendChild(li);
    return;
  }
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line; // textContent: never interpreted as HTML
    listEl.appendChild(li);
  }
}

/* ---------- Views ---------- */
function show(name) {
  view = name;
  decoyEl.hidden = name !== "decoy";
  lockEl.hidden = name !== "lock";
  panelEl.hidden = name !== "panel";
  decoyEl.setAttribute("aria-hidden", name === "decoy" ? "false" : "true");
  if (name === "lock") { entered = ""; updateDots(); errorEl.hidden = true; }
  if (name === "panel") { App.onUnlock(); } else { App.onLock(); }
}

function updateDots() {
  const dots = dotsEl.querySelectorAll(".dot");
  dots.forEach((d, i) => { d.classList.toggle("filled", i < entered.length); });
}

function onDigit(d) {
  if (view !== "lock" || entered.length >= 4) return;
  errorEl.hidden = true;
  entered += d;
  updateDots();
  if (entered.length === 4) {
    if (entered === PASSCODE) { show("panel"); }
    else { errorEl.hidden = false; entered = ""; setTimeout(updateDots, 180); }
  }
}
function onDelete() {
  if (view !== "lock" || !entered.length) return;
  entered = entered.slice(0, -1);
  errorEl.hidden = true;
  updateDots();
}

keypadEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-k]");
  if (!btn) return;
  const k = btn.getAttribute("data-k");
  if (k === "del") onDelete(); else onDigit(k);
});
lockPanelBtn.addEventListener("click", () => { show("decoy"); });

/* ---------- Hidden gesture: double-tap in top ~15% strip ---------- */
const TOP_STRIP_RATIO = 0.15;
const DOUBLE_TAP_MS = 350;
let lastTopTapAt = 0;

function isTopStrip(clientY) {
  const h = window.innerHeight || document.documentElement.clientHeight;
  return clientY <= h * TOP_STRIP_RATIO;
}
function onPointerDown(e) {
  if (view !== "decoy") return;
  if (typeof e.button === "number" && e.button !== 0) return;
  const y = e.clientY;
  if (!isTopStrip(y)) { lastTopTapAt = 0; return; }
  const now = performance.now();
  if (lastTopTapAt && now - lastTopTapAt <= DOUBLE_TAP_MS) { lastTopTapAt = 0; show("lock"); }
  else { lastTopTapAt = now; }
}
decoyEl.addEventListener("pointerdown", onPointerDown, { passive: true });

/* ---------- Decoy clock ---------- */
const FR_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
function pad2(n) { return String(n).padStart(2, "0"); }
function tickClock() {
  const now = new Date();
  decoyTimeEl.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  decoyDateEl.textContent = FR_DAYS[now.getDay()] + " " + now.getDate() + " " + FR_MONTHS[now.getMonth()];
}
tickClock();
setInterval(tickClock, 15000);

/* ================= App-specific logic ================= */
const K_PREFS = "clipboard_guard.prefs.v1";
const K_LOG = "clipboard_guard.log.v1";
const LOG_MAX = 12;
const SECS_MIN = 5, SECS_MAX = 300, SECS_STEP = 5;

const App = {
  init() {
    this.autoEl = document.getElementById("autoClear");
    this.secsEl = document.getElementById("secsVal");
    this.logEl = document.getElementById("log");

    const prefs = loadJSON(K_PREFS, { autoClear: false, secs: 30 });
    this.secs = Math.min(SECS_MAX, Math.max(SECS_MIN, prefs.secs || 30));
    this.autoEl.checked = !!prefs.autoClear;
    this.secsEl.textContent = String(this.secs);

    const persist = () => saveJSON(K_PREFS, { autoClear: this.autoEl.checked, secs: this.secs });
    this.autoEl.addEventListener("change", persist);

    const dec = document.getElementById("decBtn");
    const inc = document.getElementById("incBtn");
    const updateStepper = () => {
      this.secsEl.textContent = String(this.secs);
      dec.disabled = this.secs <= SECS_MIN;
      inc.disabled = this.secs >= SECS_MAX;
    };
    dec.addEventListener("click", () => { this.secs = Math.max(SECS_MIN, this.secs - SECS_STEP); updateStepper(); persist(); });
    inc.addEventListener("click", () => { this.secs = Math.min(SECS_MAX, this.secs + SECS_STEP); updateStepper(); persist(); });
    updateStepper();

    document.getElementById("clearBtn").addEventListener("click", async () => {
      // Best effort only: may need a user gesture / clipboard permission, and
      // cannot run in the background. We log the attempt locally regardless.
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText("");
        }
      } catch { /* permission denied / no gesture — ignored, local log still written */ }
      const log = [isoNow() + ": cleared", ...loadJSON(K_LOG, [])].slice(0, LOG_MAX);
      saveJSON(K_LOG, log);
      this.render();
    });
  },
  render() { renderLog(this.logEl, loadJSON(K_LOG, []), "No entries yet"); },
  onUnlock() { this.render(); },
  onLock() {},
};

/* ================= Boot ================= */
App.init();
show("decoy");

/* PWA service worker (app-shell only, same-origin) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  });
}
