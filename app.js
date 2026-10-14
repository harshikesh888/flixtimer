/* STREAMVERSE Theater Terminal — movies only. Friendly UI, no technical details shown. */
const $ = (s) => document.querySelector(s);
const iframe = $("#player");
const BASE = "https://vidhive.lol"; // player backend origin (protocol unchanged)
const LS_PROGRESS = "streamverse_progress_movies_v1";
const LS_PROGRESS_LEGACY = "vidhive_progress_movies_v1";
const IMG = "https://image.tmdb.org/t/p/w500";

/* one-time migration so existing watch history carries over after the rename */
try {
  if (!localStorage.getItem(LS_PROGRESS) && localStorage.getItem(LS_PROGRESS_LEGACY)) {
    localStorage.setItem(LS_PROGRESS, localStorage.getItem(LS_PROGRESS_LEGACY));
  }
} catch {}

const MOVIES = Array.isArray(window.STREAMVERSE_TOP250)
  ? window.STREAMVERSE_TOP250
  : (Array.isArray(window.VIDHIVE_TOP250) ? window.VIDHIVE_TOP250 : []);
const byId = new Map(MOVIES.map((m) => [m.id, m]));

let current = { id: 278, title: "The Shawshank Redemption" };

const store = {
  all() { try { return JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}"); } catch { return {}; } },
  save(entry) {
    if (!entry || entry.id == null) return;
    const all = store.all();
    all["movie:" + entry.id] = { ...entry, type: "movie", lastUpdated: entry.lastUpdated || Date.now() };
    try { localStorage.setItem(LS_PROGRESS, JSON.stringify(all)); } catch {}
    renderContinue();
    renderResumeStat();
  },
  get(id) { return store.all()["movie:" + id]; },
};

function opts() {
  const resumeOn = $("#optResume") ? $("#optResume").checked : true;
  const rawStart = $("#optStart") ? $("#optStart").value : "";
  return {
    autoPlay: $("#optAutoPlay") ? $("#optAutoPlay").checked : true,
    startTime: rawStart === "" ? null : Math.max(0, parseInt(rawStart, 10) || 0),
    resumeOn,
    server: ($("#optServerCustom")?.value || $("#optServer")?.value || "").trim(),
    theme: ($("#optTheme")?.value || "00E5FF").replace("#", "").trim() || "00E5FF",
  };
}

function buildUrl(media = current, o = opts()) {
  const path = `${BASE}/embed/movie/${media.id}`;
  const q = new URLSearchParams();
  if (o.autoPlay) q.set("autoPlay", "true");
  let st = o.startTime;
  if (st === null && o.resumeOn) {
    const w = store.get(media.id)?.progress?.watched;
    if (w && w > 10) st = Math.floor(w);
  }
  if (st === 0) q.set("startTime", "0");
  else if (st !== null && Number.isFinite(st)) q.set("startTime", String(st));
  if (o.server) q.set("defaultServer", o.server);
  if (o.theme) q.set("theme", o.theme);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

function fmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const FRIENDLY = { play: "Playing", pause: "Paused", playing: "Playing", paused: "Paused", seeked: "Seeking", ended: "Finished", timeupdate: null, playerstatus: null, load: "Loading" };

function activity(html) {
  const feed = $("#activity");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = "ic";
  div.innerHTML = html;
  feed.prepend(div);
  while (feed.children.length > 30) feed.lastChild.remove();
}

function activityMsg(title, sub) {
  const t = new Date().toLocaleTimeString();
  activity(`<div class="ic-ch"><span>Player</span><span>${t}</span></div><div class="ic-t">${esc(title)}</div>${sub ? `<div class="ic-m">${esc(sub)}</div>` : ""}`);
}

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

function load(media, { scroll = true, startOverride = undefined } = {}) {
  current = { ...media };
  const o = opts();
  if (startOverride !== undefined) o.startTime = startOverride;
  const url = buildUrl(current, o);
  if (iframe) iframe.src = url;
  const known = byId.get(current.id);
  const label = known ? `${known.title}` : (current.title || "Movie");
  const sub = known ? `${known.year} · Rated ${known.rating.toFixed(1)}` : "Movie";
  const nt = $("#nowTitle"); if (nt) nt.textContent = label;
  const nm = $("#nowMeta"); if (nm) nm.textContent = sub;
  const badge = $("#nowBadge");
  if (badge) badge.textContent = "Now Playing";
  const se = $("#stEvent"); if (se) se.textContent = "Loading";
  activityMsg(`Now playing — ${label}`, sub);
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("active", +c.dataset.id === +current.id));
  if (scroll) $("#player-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => { try { iframe?.contentWindow?.postMessage({ type: "VIDHIVE_PLAYER_COMMAND", action: "getMediaData" }, "*"); } catch {} }, 2500);
}

/* Player events -> friendly status only. Technical event names never shown. */
let lastStatus = "";
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "VIDHIVE_PLAYER_EVENT") {
    const d = message.data || {};
    const name = d.event || "";
    const friendly = FRIENDLY[name];
    if (friendly) {
      const se2 = $("#stEvent"); if (se2) se2.textContent = friendly;
      if (friendly !== lastStatus && (friendly === "Playing" || friendly === "Paused" || friendly === "Finished")) {
        lastStatus = friendly;
        const known = byId.get(current.id);
        const t = known ? known.title : current.title;
        if (name === "play" || name === "playing") activityMsg(`Playing — ${t}`, d.currentTime != null ? `At ${fmt(d.currentTime)}` : "");
        else if (name === "pause" || name === "paused") activityMsg(`Paused — ${t}`, d.currentTime != null ? `At ${fmt(d.currentTime)}` : "");
        else if (name === "ended") activityMsg(`Finished — ${t}`, "Thanks for watching");
      }
      const badge = $("#nowBadge");
      if (badge && (friendly === "Playing" || friendly === "Paused" || friendly === "Finished")) badge.textContent = friendly;
    }
    if (Number.isFinite(d.currentTime)) { const e = $("#stTime"); if (e) e.textContent = fmt(d.currentTime); }
    if (Number.isFinite(d.duration)) { const e = $("#stDur"); if (e) e.textContent = fmt(d.duration); }
    const pct = d.progress?.duration > 0
      ? (d.progress.watched / d.progress.duration) * 100
      : (Number.isFinite(d.currentTime) && Number.isFinite(d.duration) && d.duration > 0 ? (d.currentTime / d.duration) * 100 : 0);
    if (pct > 0) { const bar = $("#stBar"); if (bar) bar.style.width = Math.min(100, pct) + "%"; }
    if (d.progress?.watched && d) {
      // keep lightweight in-memory progress; canonical save happens on MEDIA_DATA
    }
  }

  if (message.type === "VIDHIVE_MEDIA_DATA") {
    const entry = message.data?.entry;
    if (entry) {
      store.save(entry);
      if (Number.isFinite(entry.progress?.watched)) {
        const e1 = $("#stTime"); if (e1) e1.textContent = fmt(entry.progress.watched);
        if (Number.isFinite(entry.progress?.duration)) {
          const e2 = $("#stDur"); if (e2) e2.textContent = fmt(entry.progress.duration);
          const bar2 = $("#stBar"); if (bar2) bar2.style.width = Math.min(100, (entry.progress.watched / entry.progress.duration) * 100) + "%";
        }
      }
    }
  }
});

/* ---------- catalog ---------- */
function progressPct(id) {
  const saved = store.get(id);
  if (!saved?.progress?.duration) return 0;
  return Math.min(100, (saved.progress.watched / saved.progress.duration) * 100);
}

/* Flat-design fallback artwork (no gradients, solid shapes only) for titles without a poster. */
const FALLBACK_ART = `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Movie artwork">
<rect width="200" height="300" fill="#0A2533"/>
<circle cx="170" cy="40" r="46" fill="#123C52"/>
<circle cx="20" cy="262" r="34" fill="#123C52"/>
<circle cx="100" cy="128" r="68" fill="#00BFFF"/>
<circle cx="100" cy="88" r="14" fill="#0A2533"/>
<circle cx="140" cy="128" r="14" fill="#0A2533"/>
<circle cx="100" cy="168" r="14" fill="#0A2533"/>
<circle cx="60" cy="128" r="14" fill="#0A2533"/>
<circle cx="100" cy="128" r="13" fill="#FFFFFF"/>
<rect x="0" y="232" width="200" height="40" fill="#123C52"/>
<rect x="14" y="242" width="20" height="20" fill="#FFFFFF"/>
<rect x="46" y="242" width="20" height="20" fill="#FFFFFF"/>
<rect x="78" y="242" width="20" height="20" fill="#FFFFFF"/>
<rect x="110" y="242" width="20" height="20" fill="#FFFFFF"/>
<rect x="142" y="242" width="20" height="20" fill="#FFFFFF"/>
</svg>`;
const FALLBACK_ART_WRAP = `<span class="art">${FALLBACK_ART}</span>`;

function card(m) {
  const pct = progressPct(m.id);
  const poster = m.poster
    ? `<img loading="lazy" src="${IMG}${m.poster}" alt="${esc(m.title)}" onerror="this.outerHTML=FALLBACK_ART" />`
    : FALLBACK_ART;
  return `<article class="card" data-id="${m.id}">
    <div class="poster"><span class="rank">#${m.rank}</span>${poster}</div>
    <div class="card-body"><h4>${esc(m.title)}</h4>
      <div class="meta"><span class="rate">★ ${m.rating.toFixed(1)}</span><span>${m.year}</span></div>
      ${pct > 1 ? `<div class="prog"><i style="width:${pct.toFixed(0)}%"></i></div>` : ""}
      <button class="play-btn" data-act="play">${pct > 1 ? "Resume" : "Watch"}</button>
    </div></article>`;
}

function filtered() {
  const searchEl = $("#search"), sortEl = $("#sort");
  const rateEl = $("#minRating"), eraEl = $("#era");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const sort = sortEl ? sortEl.value : "rank";
  const minR = rateEl ? (parseFloat(rateEl.value) || 0) : 0;
  const era = eraEl ? eraEl.value : "all";
  const inEra = (y) => {
    if (era === "all") return true;
    if (era === "classic") return y < 1980;
    const start = parseInt(era, 10);
    return y >= start && y < start + 10;
  };
  let list = MOVIES.filter((m) =>
    (!q || m.title.toLowerCase().includes(q) || String(m.id) === q || String(m.year) === q) &&
    (m.rating >= minR) && inEra(m.year));
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
  const gridEl = $("#grid");
  if (!gridEl) return;
  const list = filtered();
  gridEl.innerHTML = list.length ? list.map(card).join("")
    : `<p class="hint">No matches. Try a different title or year.</p>`;
  const bc = $("#browseCount");
  if (bc) bc.textContent = `${list.length} title${list.length === 1 ? "" : "s"}`;
  document.querySelectorAll("#grid .card").forEach((c) => c.classList.toggle("active", +c.dataset.id === +current.id));
}

function renderContinue() {
  const all = Object.values(store.all()).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  const row = $("#continueRow");
  if (!row) return;
  const cc = $("#continueCount");
  if (cc) cc.textContent = String(all.length);
  if (!all.length) {
    row.innerHTML = `<p class="hint">Nothing here yet. Play something and your place is saved automatically.</p>`;
  } else {
    row.innerHTML = all.slice(0, 12).map((e) => {
      const pct = e.progress?.duration ? Math.min(100, (e.progress.watched / e.progress.duration) * 100) : 0;
      const known = byId.get(e.id);
      const title = e.title || known?.title || "Movie";
      const posterPath = e.poster || known?.poster || "";
      const src = posterPath ? (posterPath.startsWith("http") ? posterPath : IMG + posterPath) : "";
      const thumb = src
        ? `<img loading="lazy" src="${src}" onerror="this.outerHTML=FALLBACK_ART_WRAP" alt=""/>`
        : FALLBACK_ART_WRAP;
      return `<div class="mini-card" data-id="${e.id}">
        ${thumb}
        <div><div class="t">${esc(title)}</div><div class="s">Left off at ${fmt(e.progress?.watched)} · ${pct.toFixed(0)}% watched</div></div>
        <span class="go">Resume</span></div>`;
    }).join("");
  }
}

function renderTopRated() {
  const host = $("#topRated");
  if (!host) return;
  const top = [...MOVIES].sort((a, b) => b.rating - a.rating || a.rank - b.rank).slice(0, 5);
  host.innerHTML = top.map((m) => `
    <div class="mini-card" data-id="${m.id}">
      <img loading="lazy" src="${IMG}${m.poster}" onerror="this.outerHTML=FALLBACK_ART_WRAP" alt=""/>
      <div><div class="t">${esc(m.title)}</div><div class="s">#${m.rank} · ★ ${m.rating.toFixed(1)} · ${m.year}</div></div>
      <span class="go">Play</span></div>`).join("");
}

function renderStats() {
  const st = $("#statTotal"); if (st) st.textContent = String(MOVIES.length);
  const lc = $("#libCount"); if (lc) lc.textContent = String(MOVIES.length);
  if (MOVIES.length) {
    const avg = MOVIES.reduce((s, m) => s + m.rating, 0) / MOVIES.length;
    const sa = $("#statAvg"); if (sa) sa.textContent = avg.toFixed(1);
    const top = [...MOVIES].sort((a, b) => b.rating - a.rating)[0];
    const stp = $("#statTop"); if (stp) stp.textContent = `★ ${top.rating.toFixed(1)}`;
  }
  renderResumeStat();
}

function renderResumeStat() {
  const all = Object.values(store.all());
  const el = $("#resumeStat");
  if (!el) return;
  if (!all.length) el.textContent = "No saved progress yet";
  else {
    const latest = all.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))[0];
    const known = byId.get(latest.id);
    el.textContent = `Resuming: ${latest.title || known?.title || "Movie"} · ${fmt(latest.progress?.watched)}`;
  }
}

/* ---------- wiring ---------- */
function playById(id) {
  id = +id;
  if (!Number.isFinite(id) || id <= 0) return;
  const known = byId.get(id);
  load({ id, title: known?.title || ("Movie " + id) });
}

$("#grid")?.addEventListener("click", (e) => {
  const cEl = e.target.closest(".card");
  if (!cEl) return;
  playById(cEl.dataset.id);
});
$("#continueRow")?.addEventListener("click", (e) => {
  const cEl = e.target.closest("[data-id]");
  if (!cEl) return;
  const os = $("#optStart"); if (os) os.value = "";
  playById(cEl.dataset.id);
});
$("#topRated")?.addEventListener("click", (e) => {
  const cEl = e.target.closest("[data-id]");
  if (!cEl) return;
  const os2 = $("#optStart"); if (os2) os2.value = "";
  playById(cEl.dataset.id);
});
$("#quickPlay")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#qpId"); if (!q) return;
  playById(q.value);
  q.value = "";
});
document.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => playById(b.dataset.play)));
$("#search")?.addEventListener("input", renderGrid);
$("#sort")?.addEventListener("change", renderGrid);
$("#minRating")?.addEventListener("change", renderGrid);
$("#era")?.addEventListener("change", renderGrid);
$("#swatches")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme]");
  if (!b) return;
  document.querySelectorAll("#swatches button").forEach((x) => x.classList.remove("on"));
  b.classList.add("on");
  const ot = $("#optTheme"); if (ot) ot.value = b.dataset.theme;
  load(current, { scroll: false });
});
$("#applyOpts")?.addEventListener("click", () => load(current, { scroll: false }));
$("#btnRestart")?.addEventListener("click", () => {
  const os = $("#optStart"); if (os) os.value = "0";
  load(current, { scroll: false });
  activityMsg("Restarted from the beginning", byId.get(current.id)?.title || "");
});
$("#btnResume")?.addEventListener("click", () => {
  const os = $("#optStart"); if (os) os.value = "";
  const saved = store.get(current.id)?.progress?.watched;
  load(current, { scroll: false });
  activityMsg(saved ? `Resuming at ${fmt(saved)}` : "Resuming", byId.get(current.id)?.title || "");
});
$("#clearProgress")?.addEventListener("click", () => {
  try { localStorage.removeItem(LS_PROGRESS); localStorage.removeItem(LS_PROGRESS_LEGACY); } catch {}
  renderContinue();
  renderResumeStat();
  renderGrid();
});
document.querySelectorAll(".top-center .region-btn").forEach((a) => {
  a.addEventListener("click", () => {
    document.querySelectorAll(".top-center .region-btn").forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
  });
});

/* ---------- boot ---------- */
function boot() {
  const lines = ["Loading catalog — 250 titles", "Connecting player", "Restoring watch history"];
  const box = $("#bootLines");
  const bootEl = $("#boot"), mainEl = $("#main"), finalEl = $("#bootFinal");
  // Failsafe: never trap the user on the boot screen. Force-show after 3s.
  setTimeout(() => { bootEl?.classList.add("done"); mainEl?.classList.add("show"); }, 3000);
  if (!box) { bootEl?.classList.add("done"); mainEl?.classList.add("show"); return; }
  box.innerHTML = "";
  lines.forEach((l, i) => {
    setTimeout(() => {
      const div = document.createElement("div");
      div.innerHTML = `<span class="ok">›</span> ${l} <span class="ok">… OK</span>`;
      box.appendChild(div);
      if (i === lines.length - 1) {
        setTimeout(() => {
          $("#bootFinal")?.classList.add("show");
          setTimeout(() => {
            $("#boot")?.classList.add("done");
            $("#main")?.classList.add("show");
          }, 450);
        }, 250);
      }
    }, 280 * (i + 1));
  });
}

/* ---------- init (each step isolated so one bad section can't blank the page) ---------- */
(function init() {
  const step = (fn) => { try { fn(); } catch (err) { console.error(err); } };
  step(renderStats);
  step(renderContinue);
  step(renderTopRated);
  step(renderGrid);
  step(boot);
  step(() => {
    const first = byId.get(278) || MOVIES[0] || current;
    load({ id: first.id ?? 278, title: first.title || "Movie" }, { scroll: false });
  });
})();
