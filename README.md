# VIDHIVE Theater — Top 250 Movies

Static movies-only streaming site built on the VIDHIVE docs. No build step — open `index.html` or serve the folder. No TV endpoints: every card maps to one fixed TMDB **movie** ID, so playback is deterministic (no random fallback titles).

## Run

```bash
cd vidhive-player-site
python3 -m http.server 8080
# → http://localhost:8080
```

## Catalog

- `movies.js` — the fixed Top-250 list: `rank, title, year, rating, id (TMDB), poster`.
- TMDB IDs + poster paths were resolved via the TMDB search API (exact release-year match per title) and verified against the TMDB ID export.
- Posters load from `https://image.tmdb.org/t/p/w500` (stable CDN paths, no API key needed at runtime).

## What it implements (mapped to docs)

| Docs section | Implementation |
|---|---|
| Quick Start iframe + 16:9 container | `.ratio` div in `index.html` (`padding-bottom: 56.25%`, absolute iframe) |
| Movie endpoint `/embed/movie/${id}` | `buildUrl()` in `app.js` (TV endpoints removed) |
| `autoPlay` | checkbox → `?autoPlay=true` |
| `startTime` | number input → `?startTime=`; blank falls back to saved localStorage progress (per docs) |
| `defaultServer` | select + custom input → `?defaultServer=` (e.g. `cinevault`) |
| `theme` | Neon cyan `00E5FF` default + 4 docs presets (E5A93C/16A085/2980B9/9B59B6) + custom hex → `?theme=` |
| Implementation snippets | HTML / React / Tailwind tabs, generated from live URL |
| Events API listener | `window` listener for `VIDHIVE_PLAYER_EVENT` (play/pause/seeked/ended/timeupdate/playerstatus) + live status cards + event log |
| `VIDHIVE_MEDIA_DATA` canonical save | full `entry` shown in payload box, persisted to `localStorage` |
| `getStatus` / `getMediaData` | buttons + auto `getMediaData` after load |
| Backend example | `store.save()` mirrors the Express `/api/player-progress` upsert — swap for `fetch POST` |

## Files

- `index.html` — layout, player, options panel, Top-250 grid
- `movies.js` — generated fixed catalog (do not hand-edit; see `resolve_tmdb.py` notes)
- `app.js` — URL builder, postMessage API, storage, filtering/sorting
- `styles.css` — dark theme, responsive grid
