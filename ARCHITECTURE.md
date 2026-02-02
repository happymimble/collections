# Architecture: Local-First Desktop Search & Enrichment Engine

Plugin-based search and enrichment for real-world objects.  
Stack: **SvelteKit** (frontend), **Tauri** (desktop shell), **TypeScript** (backend logic), **SQLite** (persistence). Target: Windows executable.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  TAURI WINDOW (single process)                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  WEBVIEW                                                     │ │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐ │ │
│  │  │  SvelteKit (UI)      │  │  Backend (TypeScript)         │ │ │
│  │  │  - Routes, components│──│  - Search / enrichment logic  │ │ │
│  │  │  - State, events     │  │  - Plugin orchestration       │ │ │
│  │  └──────────┬──────────┘  └───────────────┬──────────────┘ │ │
│  │             │                              │                 │ │
│  │             │  invoke() / events           │                 │ │
│  └─────────────┼─────────────────────────────┼─────────────────┘ │
│                ▼                              ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  RUST (Tauri core)                                           │ │
│  │  - IPC command handlers  - SQLite access  - FS / plugins dir │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                                  │
│                                ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  SQLite (file on disk)                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- **One process:** Tauri main process hosts the WebView. No separate Node or HTTP server.
- **Frontend and “backend” both run in the WebView:** SvelteKit is the UI; TypeScript modules beside it implement search, enrichment, and plugin orchestration. Persistence and OS access go through Tauri IPC only.
- **Single source of truth:** SQLite, accessed only from Rust. No in-memory cache treated as source of truth.

---

## 2. Layer Responsibilities

| Layer | Responsibility | Does *not* |
|-------|----------------|------------|
| **SvelteKit (UI)** | Routing, components, user input, display of search/enrichment results, calling backend API and Tauri commands | Business rules, SQL, plugin loading, direct FS/DB access |
| **Backend (TypeScript)** | Search pipeline, enrichment pipeline, plugin discovery and execution, validation, orchestration | Persistence, IPC, DOM, UI state |
| **Tauri (Rust)** | Window lifecycle, IPC handlers, SQLite read/write, reading plugin directory and manifest, security boundaries | Search/enrichment logic, UI |
| **SQLite** | Persistent store for objects, metadata, plugin state, user data | Caching, business logic |

**Persistence ≠ UI:** All reads/writes to SQLite are done in Rust. The frontend never sees raw SQL or file paths.  
**Cache ≠ source of truth:** Any in-memory cache (e.g. search index, denormalized data) is derived from SQLite and can be rebuilt from it.

---

## 3. Process Model at Runtime

1. **Startup**
   - Tauri starts; opens SQLite DB (e.g. in app data dir).
   - Tauri loads the WebView with the SvelteKit-built app (static/adapter-static; no Node server).
   - Frontend loads; optional init call to Tauri (e.g. `get_config`) or backend (e.g. load default plugins).

2. **User action (e.g. search)**
   - UI calls a **backend** function (TypeScript), e.g. `search(query, options)`.
   - Backend runs search logic; when it needs **persisted data** (objects, indexes, plugin config), it does *not* touch SQLite. It expects data to be provided by the **caller** or via an **adapter**.
   - The **frontend** (or a thin bridge) is the only place that calls Tauri. So: backend returns “I need objects matching X” or the frontend first gets data via Tauri, then passes it into backend. Preferred: frontend invokes Tauri commands (e.g. `db_query_objects`, `db_get_plugin_state`), gets results, passes them into backend; backend returns enriched/transformed results; frontend displays them and may invoke Tauri again to persist (e.g. `db_save_objects`). This keeps backend pure and testable.

3. **Persistence flow**
   - **Read:** UI or bridge invokes Tauri command → Rust runs SQLite query → returns JSON (or structured data) to WebView.
   - **Write:** UI or bridge invokes Tauri command with payload → Rust validates and writes to SQLite → returns success/failure.
   - Backend never imports or assumes a DB; it receives and returns data.

4. **Plugins**
   - Plugins are TypeScript/JavaScript modules implementing a known contract (e.g. search provider, enricher).
   - **Discovery:** Rust lists plugin directory (e.g. `plugins/` or `%APPDATA%/app/plugins`), reads a manifest (e.g. `plugin.json`) per plugin, exposes list via IPC (e.g. `list_plugins`).
   - **Loading:** Frontend or a dedicated loader in the WebView calls `list_plugins`, then for each enabled plugin does a dynamic `import()` of the plugin’s entry (path or URL provided by Tauri, e.g. via `asset://` or path resolved by Rust). Plugin code runs in the same WebView context; backend invokes plugin functions (search, enrich) and uses their return values. No direct DB or shell for plugins unless explicitly exposed via Tauri.

5. **Shutdown**
   - User closes window → Tauri closes WebView and DB connections, then exits.

---

## 4. IPC Contract (Tauri ↔ WebView)

Commands invoked from the frontend (or a small bridge) only. Backend stays unaware of IPC.

- **App / config:** `get_app_dir`, `get_config`, `set_config`
- **Database:** `db_query_objects`, `db_get_object`, `db_save_objects`, `db_delete_objects`, `db_get_plugin_state`, `db_set_plugin_state`
- **Plugins:** `list_plugins`, `get_plugin_asset_path` (or equivalent so the WebView can load plugin entry script)
- **Events (Tauri → WebView):** Optional, e.g. `plugin-list-changed` after FS watcher or user refresh.

All payloads are serializable (e.g. JSON). Rust validates and sanitizes; no raw SQL or paths exposed to the WebView.

---

## 5. Recommended Directory and File Structure

```
collections/
├── src/                          # SvelteKit app (frontend)
│   ├── lib/
│   │   ├── components/            # Reusable UI components
│   │   ├── stores/               # Svelte stores (UI state)
│   │   ├── api/                  # Thin layer: calls backend + Tauri
│   │   │   └── tauri.ts          # Wrappers around invoke()
│   │   └── backend/              # TypeScript “backend” (no IPC, no DB)
│   │       ├── search.ts         # Search pipeline
│   │       ├── enrichment.ts     # Enrichment pipeline
│   │       ├── plugins/         # Plugin loader & registry (in WebView)
│   │       │   ├── loader.ts     # Dynamic import, contract check
│   │       │   └── types.ts      # Plugin interfaces
│   │       └── types.ts          # Shared domain types
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   └── ...
│   └── app.d.ts
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/             # IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── app.rs
│   │   │   ├── db.rs
│   │   │   └── plugins.rs
│   │   ├── db/                   # SQLite access
│   │   │   ├── mod.rs
│   │   │   └── schema.rs         # Migrations / schema
│   │   └── plugin_discovery.rs   # List plugin dir, read manifests
│   ├── Cargo.toml
│   └── tauri.conf.json
├── plugins/                      # Built-in / dev plugins (optional)
│   └── example/
│       ├── plugin.json           # name, version, entry
│       └── index.ts
├── ARCHITECTURE.md               # This document
└── README.md
```

- **Frontend:** `src/lib/api/` is the only place that should call `invoke()`. It gets/sends data and calls `src/lib/backend/` with plain data.
- **Backend:** `src/lib/backend/` contains all search, enrichment, and plugin execution logic; no imports from `api/` or Tauri.
- **Rust:** All SQLite and plugin-dir access lives under `src-tauri/src/`. Commands are small: parse args, call db or discovery, return serializable result.

User-installed plugins can live outside the repo (e.g. `%APPDATA%/collections/plugins`). Rust resolves the plugin root from config or env and lists that directory; same manifest and entry contract.

---

## 6. Plugins: Location and Loading

**Where plugin code lives**

- **Development / built-in:** Repo `plugins/<name>/` with `plugin.json` + entry (e.g. `index.ts`). Tauri can serve these via asset protocol or path allowed in `tauri.conf.json`.
- **User-installed:** A single directory (e.g. `%APPDATA%/collections/plugins`). Each plugin is a subfolder with `plugin.json` and entry file. Rust reads this dir; no execution of arbitrary paths.

**Manifest (`plugin.json`)**

- `id`, `name`, `version`, `entry` (e.g. `"index.js"` or `"index.ts"`). Optional: `capabilities` (e.g. `["search", "enrich"]`).

**Loading flow**

1. Frontend (or bridge) calls Tauri `list_plugins` → Rust scans plugin dir(s), reads manifests, returns list of `{ id, name, version, entry, pathOrUrl }`.
2. For each enabled plugin, frontend/loader uses the path or URL to dynamic-`import()` the entry. Entry exports implement known interfaces (e.g. `SearchProvider`, `Enricher`).
3. Backend’s plugin registry holds these instances and uses them in search/enrichment pipelines. Plugins receive input (query, object) and return output (results, enriched fields); they do not receive DB or IPC. If a plugin needs to persist state, the app does it via Tauri commands using `db_get_plugin_state` / `db_set_plugin_state` keyed by plugin id.

**Security**

- Plugins run in the same WebView; they can access the same DOM and globals unless isolated (e.g. iframe or worker). For simplicity, start with same-context and enforce contract and input validation; optional future step is to run plugins in a worker or sandboxed iframe.
- Rust does not execute plugin code; it only lists and serves paths. Execution is entirely in the WebView under the app’s control.

---

## 7. Summary

- **Frontend:** SvelteKit, UI only; calls TypeScript backend with data and Tauri for persistence and plugin discovery.
- **Backend:** TypeScript, all search/enrichment and plugin orchestration; no IPC, no SQLite; receives and returns data.
- **Tauri (Rust):** Process, window, IPC, SQLite, plugin directory discovery and safe path/asset exposure.
- **SQLite:** Single source of truth; only Rust touches it.
- **Plugins:** TypeScript/JS in a defined directory, manifest-driven, loaded in WebView via dynamic import; backend invokes them; state persisted via Tauri commands.

This keeps layers strict, avoids over-engineering, and keeps the backend testable and independent of Tauri and SQLite.
