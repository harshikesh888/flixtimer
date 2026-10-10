/* VIDHIVE Theater — movies only.
   Fixed Top-250 catalog (movies.js): every card maps to one TMDB movie id,
   so playback is deterministic. Uses docs techniques:
   responsive 16:9 iframe, /embed/movie endpoint + autoPlay/startTime/
   defaultServer/theme, postMessage Events API (VIDHIVE_PLAYER_EVENT /
   VIDHIVE_MEDIA_DATA), getStatus / getMediaData commands, localStorage resume. */
const $ = (s) => document.querySelector(s);
const iframe = $("#player");
const BASE = "https://vidhive.lol";
const IMG = "https://image.tmdb.org/t/p/w500";
const LS_PROGRESS = "vidhive_progress_movies_v1"; // { ["movie:<id>"]: entry }

const MOVIES = Array.isArray(window.VIDHIVE_TOP250) ? window.VIDHIVE_TOP250 : [];
const byId = new Map(MOVIES.map((m) => [m.id, m]));

let current = { id: 278, title: "The Shawshank Redemption" };
let lastEntry = null;
let activeTab = "html";

/* ---------- storage: mirrors docs Express /api/player-progress upsert ---------- */
const store = {
  all() { try { return JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}"); } catch { return {}; } },
  save(entry) {
    if (!entry || entry.id == null) return;
    const all = store.all();
    all["movie:" + entry.id] = { ...entry, type: "movie", lastUpdated: entry.lastUpdated || Date.now() };
    localStorage.setItem(LS_PROGRESS, JSON.stringify(all));
    renderContinue();
  },
  get(id) { return store.all()["movie:" + id]; },
};

/* ---------- embed URL builder (movie params from docs) ---------- */
function opts() {
  return {
    autoPlay: $("#optAutoPlay").checked,
    startTime: $("#optStart").value === "" ? null : Math.max(0, parseInt($("#optStart").value, 10) || 0),
    server: ($("#optServerCustom").value || $("#optServer").value || "").trim(),
    theme: ($("#optTheme").value || "00E5FF").replace("#", "").trim() || "00E5FF",
  };
}
function buildUrl(media = current, o = opts()) {
  const path = `${BASE}/embed/movie/${media.id}`;
  const q = new URLSearchParams();
  if (o.autoPlay) q.set("autoPlay", "true");
  // startTime: explicit value wins; else fall back to saved localStorage progress (per docs)
  let st = o.startTime;
  if (st === null) {
    const w = store.get(media.id)?.progress?.watched;
    if (w && w > 10) st = Math.floor(w);
  }
  if (st !== null && Number.isFinite(st)) q.set("startTime", String(st));
  if (o.server) q.set("defaultServer", o.server);
  if (o.theme) q.set("theme", o.theme);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

function load(media, { scroll = true } = {}) {
  current = { ...media };
  const url = buildUrl();
  iframe.src = url;
  $("#embedUrl").textContent = url;
  $("#nowTitle").textContent = `Player — ${current.title || ("Movie " + current.id)}`;
  $("#nowMeta").textContent = `movie ${current.id} · ${opts().theme}`;
  renderSnippet(url);
  addLog("load", `iframe → ${url}`);
  if (scroll) $("#player-section").scrollIntoView({ behavior: "smooth", block: "start" });
  // Ask for an immediate snapshot once the player is ready (per docs step 4)
  setTimeout(() => sendCommand("getMediaData"), 2500);
}

/* ---------- Events API: parent window listener + commands ---------- */
function fmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function addLog(event, detail) {
  const li = document.createElement("li");
  const safe = String(detail || "").replace(/</g, "&lt;");
  li.innerHTML = `<time>${new Date().toLocaleTimeString()}</time><b>${event}</b> ${safe ? "· " + safe : ""}`;
  const log = $("#log");
  log.prepend(li);
  while (log.children.length > 40) log.lastChild.remove();
}
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "VIDHIVE_PLAYER_EVENT") {
    const { event: name, currentTime, duration, progress } = message.data || {};
    $("#stEvent").textContent = name || "—";
    if (Number.isFinite(currentTime)) $("#stTime").textContent = fmt(currentTime);
    if (Number.isFinite(duration)) $("#stDur").textContent = fmt(duration);
    const pct = progress?.duration > 0
      ? (progress.watched / progress.duration) * 100
      : (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0);
    $("#stBar").style.width = Math.min(100, pct) + "%";
    const extra = message.data?.title ? ` · ${message.data.title}` : "";
    addLog(name || "event", `${fmt(currentTime)} / ${fmt(duration)}${extra}`);
    if (progress?.watched && message.data) {
      lastEntry = {
        id: message.data.tmdbId ?? current.id,
        type: "movie",
        title: message.data.title ?? current.title,
        poster: message.data.poster ?? "",
        progress, lastUpdated: Date.now(),
      };
    }
  }

  if (message.type === "VIDHIVE_MEDIA_DATA") {
    // Canonical payload to persist (per docs framework/backend examples)
    const entry = message.data?.entry;
    lastEntry = entry || lastEntry;
    $("#payload").textContent = JSON.stringify(entry ?? message.data ?? {}, null, 2);
    if (entry) {
      store.save(entry); // swap this for: fetch("/api/player-progress", {method:"POST", body: JSON.stringify({tmdbId: entry.id, mediaType: "movie", progress: entry})})
      addLog("VIDHIVE_MEDIA_DATA", `saved movie ${entry.id}`);
    }
  }
});
function sendCommand(action) {
  iframe?.contentWindow?.postMessage({ type: "VIDHIVE_PLAYER_COMMAND", action }, "*");
  addLog("command", action);
}

/* ---------- snippets ---------- */
function renderSnippet(url) {
  const u = url || $("#embedUrl").textContent;
  const tabs = {
    html: `<iframe\n  src="${u}"\n  width="100%"\n  height="100%"\n  frameborder="0"\n  allowfullscreen\n  allow="encrypted-media"\n></iframe>`,
    react: `<iframe\n  src="${u}"\n  width="100%"\n  height="100%"\n  frameBorder="0"\n  allowFullScreen\n  allow="encrypted-media"\n/>`,
    tailwind: `<!-- 16:9 Aspect Ratio Container -->\n<div className="relative w-full pt-[56.25%]">\n  <iframe\n    src="${u}"\n    className="absolute top-0 left-0 w-full h-full"\n    frameBorder="0"\n    allowFullScreen\n    allow="encrypted-media"\n  />\n</div>`,
  };
  $("#snippet").textContent = tabs[activeTab];
}

/* ---------- catalog rendering ---------- */
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function progressPct(id) {
  const saved = store.get(id);
  if (!saved?.progress?.duration) return 0;
  return Math.min(100, (saved.progress.watched / saved.progress.duration) * 100);
}
function card(m) {
  const pct = progressPct(m.id);
  const poster = m.poster
    ? `<img loading="lazy" src="${IMG}${m.poster}" alt="${esc(m.title)}" onerror="this.remove()" />`
    : `<span>${esc((m.title || "?").slice(0, 1))}</span>`;
  return `<article class="card" data-id="${m.id}">
    <div class="poster"><span class="rank">#${m.rank}</span>${poster}</div>
    <div class="card-body"><h4>${esc(m.title)}</h4>
      <div class="meta"><span class="rate">★ ${m.rating.toFixed(1)}</span><span>${m.year}</span><span>ID ${m.id}</span></div>
      ${pct > 1 ? `<div class="prog"><i style="width:${pct.toFixed(0)}%"></i></div>` : ""}
      <div class="row"><button class="btn small primary" data-act="play">▶ Play</button></div>
    </div></article>`;
}
function filtered() {
  const q = $("#search").value.trim().toLowerCase();
  const sort = $("#sort").value;
  let list = MOVIES.filter((m) => !q || m.title.toLowerCase().includes(q) || String(m.id) === q || String(m.year) === q);
  const by = {
    "rank": (a, b) => a.rank - b.rank,
    "rating": (a, b) => b.rating - a.rating || a.rank - b.rank,
    "year-desc": (a, b) => b.year - a.year || a.rank - b.rank,
    "year-asc": (a, b) => a.year - b.year || a.rank - b.rank,
    "az": (a, b) => a.title.localeCompare(b.title),
  }[sort] || ((a, b) => a.rank - b.rank);
  return list.sort(by);
}
function renderGrid() {
  const list = filtered();
  $("#grid").innerHTML = list.length ? list.map(card).join("")
    : `<p class="hint">No matches in the Top 250. Try a different title, year, or TMDB ID.</p>`;
}
function renderContinue() {
  const all = Object.values(store.all()).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  const row = $("#continueRow");
  if (!all.length) {
    row.innerHTML = `<p class="hint">No saved progress yet. Play something — <code>VIDHIVE_MEDIA_DATA</code> snapshots are stored locally.</p>`;
  } else {
    row.innerHTML = all.slice(0, 12).map((e) => {
      const pct = e.progress?.duration ? Math.min(100, (e.progress.watched / e.progress.duration) * 100) : 0;
      const known = byId.get(e.id);
      const poster = (e.poster || known?.poster)
        ? `<img loading="lazy" src="${e.poster && e.poster.startsWith("http") ? e.poster : IMG + (e.poster || known.poster)}" onerror="this.remove()"/>`
        : esc((e.title || "?").slice(0, 1));
      return `<article class="card" data-id="${e.id}">
        <div class="poster">${poster}</div>
        <div class="card-body"><h4>${esc(e.title || known?.title || ("Movie " + e.id))}</h4>
        <div class="meta"><span>Movie</span><span>${fmt(e.progress?.watched)} left off</span></div>
        <div class="prog"><i style="width:${pct.toFixed(0)}%"></i></div>
        <div class="row"><button class="btn small primary" data-act="resume">▶ Resume ${fmt(e.progress?.watched)}</button></div>
        </div></article>`;
    }).join("");
  }
  renderGrid();
}

/* ---------- events wiring ---------- */
function playById(id) {
  id = +id;
  if (!Number.isFinite(id) || id <= 0) return;
  const known = byId.get(id);
  load({ id, title: known?.title || ("Movie " + id) });
}
$("#grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]"), cardEl = e.target.closest(".card");
  if (!btn || !cardEl) return;
  playById(cardEl.dataset.id);
});
$("#continueRow").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]"), cardEl = e.target.closest(".card");
  if (!btn || !cardEl) return;
  $("#optStart").value = ""; // blank => builder auto-uses saved progress as startTime
  playById(cardEl.dataset.id);
});
$("#quickPlay").addEventListener("submit", (e) => {
  e.preventDefault();
  playById($("#qpId").value);
});
document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => playById(b.dataset.play)));
$("#search").addEventListener("input", renderGrid);
$("#sort").addEventListener("change", renderGrid);
$("#swatches").addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme]");
  if (!b) return;
  document.querySelectorAll("#swatches button").forEach((x) => x.classList.remove("on"));
  b.classList.add("on");
  $("#optTheme").value = b.dataset.theme;
});
$("#applyOpts").addEventListener("click", () => load(current, { scroll: false }));
["optAutoPlay", "optStart", "optServer", "optServerCustom", "optTheme"]
  .forEach((id) => $("#" + id).addEventListener("change", () => {
    $("#embedUrl").textContent = buildUrl(); renderSnippet();
  }));
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("on"));
  b.classList.add("on"); activeTab = b.dataset.tab; renderSnippet();
}));
$("#btnStatus").addEventListener("click", () => sendCommand("getStatus"));
$("#btnMedia").addEventListener("click", () => sendCommand("getMediaData"));
$("#copyUrl").addEventListener("click", () => navigator.clipboard.writeText($("#embedUrl").textContent));
$("#openUrl").addEventListener("click", () => window.open($("#embedUrl").textContent, "_blank"));
$("#copySnippet").addEventListener("click", () => navigator.clipboard.writeText($("#snippet").textContent));
$("#btnCopyEntry").addEventListener("click", () => navigator.clipboard.writeText($("#payload").textContent));
$("#clearProgress").addEventListener("click", () => { localStorage.removeItem(LS_PROGRESS); renderContinue(); });

/* ---------- init ---------- */
(function init() {
  renderContinue();
  const first = byId.get(278) || MOVIES[0] || current;
  load({ id: first.id ?? first.tmdb ?? 278, title: first.title || "Movie" }, { scroll: false });
})();
