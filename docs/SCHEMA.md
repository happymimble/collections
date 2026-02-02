# SQLite Schema & Migrations

Database design for the local-first desktop search application. SQLite is the sole persistence layer; all data is JSON-serializable. Access is from the local backend (Tauri/Rust); no remote sync or background jobs.

---

## 1. Table-by-table schema

### 1.1 Cached cards (`cards`)

**Purpose:** Store the latest authoritative state of each card. One row per card; no history. CardData is stored as a single JSON blob so the schema does not change when the CardData type evolves.

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Card id (e.g. UUID or plugin:id). |
| `source_plugin_id` | TEXT | NOT NULL, indexed | Plugin that produced this card; extracted for indexing and filtering without parsing JSON. |
| `data` | TEXT | NOT NULL | Full CardData as JSON. |
| `updated_at` | TEXT | NOT NULL | ISO 8601; last write time for ordering and debugging. |

**Rationale:**
- **id as PK:** Matches CardData.id; stable and unique.
- **source_plugin_id denormalized:** Enables "cards by plugin" queries and indices without parsing JSON on every read. Required because plugins are a primary filter dimension.
- **data as JSON blob:** Keeps the schema domain-agnostic and avoids a large number of columns or ALTERs when CardData gains optional fields. All fields (title, valuations, tags, customFields, etc.) live inside `data`.
- **updated_at:** Supports "recently updated" ordering and cache/debug tooling. No separate `created_at` column; creation time is inside `data` (CardData.createdAt).

**Indices:**
- `CREATE INDEX idx_cards_source_plugin_id ON cards(source_plugin_id);`
- `CREATE INDEX idx_cards_updated_at ON cards(updated_at);` (optional; for "recent" lists)

---

### 1.2 Folder definitions (`folders`)

**Purpose:** Define named folders. Folders are containers; membership is captured in folder-card snapshots, not here.

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique folder id (e.g. UUID). |
| `name` | TEXT | NOT NULL | Display name. |
| `description` | TEXT | — | Optional. |
| `created_at` | TEXT | NOT NULL | ISO 8601. |
| `updated_at` | TEXT | — | ISO 8601. |

**Rationale:**
- Folders are independent of cards; no FK to cards. Snapshot tables link folders to cards.
- Simple CRUD; no JSON needed for this table.

**Indices:** None beyond PK unless we add "folders by name" search later.

---

### 1.3 Folder-card snapshots (`folder_snapshots`, `folder_snapshot_cards`)

**Purpose:** Record which cards belong to a folder at a point in time. Multiple snapshots per folder allow history (e.g. "folder contents as of last week"). Each snapshot is a list of card ids with optional order.

**Table: `folder_snapshots`**

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique snapshot id (e.g. UUID). |
| `folder_id` | TEXT | NOT NULL, FK → folders(id) | Folder this snapshot belongs to. |
| `created_at` | TEXT | NOT NULL | ISO 8601; when the snapshot was taken. |

**Table: `folder_snapshot_cards`**

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `snapshot_id` | TEXT | NOT NULL, FK → folder_snapshots(id) | Snapshot. |
| `card_id` | TEXT | NOT NULL, FK → cards(id) | Card in this snapshot. |
| `position` | INTEGER | — | Order within the snapshot (0-based). |
| — | — | PRIMARY KEY (snapshot_id, card_id) | One row per card per snapshot. |

**Rationale:**
- **Two tables:** Snapshots are first-class (id, folder_id, created_at); contents are in a join table so we can have many cards per snapshot and many snapshots per folder.
- **FK to cards(id):** Ensures we only reference existing cards. On card delete, app can either cascade-remove from snapshot_cards or leave referential integrity to the app (SQLite FK optional). Document: recommend ON DELETE CASCADE or app-level cleanup.
- **position:** Optional but useful for preserving user order in a folder snapshot.
- **Composite PK (snapshot_id, card_id):** Prevents duplicate (snapshot, card) and gives a natural index for "cards in this snapshot."

**Indices:**
- `CREATE INDEX idx_folder_snapshots_folder_id ON folder_snapshots(folder_id);` — list snapshots for a folder.
- `CREATE INDEX idx_folder_snapshot_cards_snapshot_id ON folder_snapshot_cards(snapshot_id);` — list cards in a snapshot (PK already indexes this; add only if we query by card_id often).
- `CREATE INDEX idx_folder_snapshot_cards_card_id ON folder_snapshot_cards(card_id);` — "which snapshots contain this card" if needed.

---

### 1.4 Group definitions (`group_definitions`)

**Purpose:** Persist group definitions only (name, source, rules). Membership is never stored; it is computed from CardData at runtime.

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique group id (e.g. UUID or plugin:id). |
| `name` | TEXT | NOT NULL | Display name (user-editable). |
| `description` | TEXT | — | Optional. |
| `source` | TEXT | NOT NULL, CHECK IN ('user','suggested') | Origin: user-created or plugin-suggested. |
| `suggested_plugin_id` | TEXT | — | Set when source = 'suggested'. |
| `suggested_template_id` | TEXT | — | Plugin's suggestion id when source = 'suggested'. |
| `rules_json` | TEXT | NOT NULL | JSON array of GroupRule (declarative + computed). |
| `rule_logic` | TEXT | NOT NULL, CHECK IN ('and','or') | How to combine rules. |
| `created_at` | TEXT | NOT NULL | ISO 8601. |
| `updated_at` | TEXT | — | ISO 8601. |

**Rationale:**
- **rules_json:** GroupRule is a union type (declarative vs computed); storing as JSON avoids a complex normalized rule table and keeps the schema stable as rule shape evolves.
- **source + suggested_*:** Supports UX (show "from Plugin X", match suggestions on re-suggest). No FK to plugins; plugins are not stored in DB.
- **No membership table:** By design; membership is derived from CardData + rules.

**Indices:** None beyond PK unless we add "groups by source" or "by suggested_plugin_id" queries.

---

### 1.5 Search history (`search_history`)

**Purpose:** Append-only log of raw search queries for replay or UI history. No joins to cards or other tables; standalone rows.

| Column | SQLite type | Constraints | Description |
|--------|-------------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique row id (e.g. UUID). |
| `query` | TEXT | NOT NULL | Free-text query string. |
| `filters_json` | TEXT | — | Optional JSON object (SearchQuery.filters). |
| `created_at` | TEXT | NOT NULL | ISO 8601; when the search was run. |

**Rationale:**
- **Raw only:** No card ids, no FKs. Each row is self-contained.
- **query + filters_json:** Enough to reconstruct a SearchQuery for replay; minimal and JSON-serializable.
- **Append-only:** No updates or deletes required for core behavior; optional retention policy can delete old rows by created_at.

**Indices:**
- `CREATE INDEX idx_search_history_created_at ON search_history(created_at);` — recent-first listing and retention pruning.

---

## 2. Primary keys, foreign keys, constraints

| Table | Primary key | Foreign keys | Other constraints |
|-------|-------------|--------------|-------------------|
| `cards` | `id` | — | — |
| `folders` | `id` | — | — |
| `folder_snapshots` | `id` | `folder_id` → folders(id) | — |
| `folder_snapshot_cards` | (snapshot_id, card_id) | `snapshot_id` → folder_snapshots(id), `card_id` → cards(id) | — |
| `group_definitions` | `id` | — | source IN ('user','suggested'), rule_logic IN ('and','or') |
| `search_history` | `id` | — | — |

**FK behavior:** For folder_snapshot_cards, recommend ON DELETE CASCADE from folder_snapshots (deleting a snapshot removes its card rows) and either ON DELETE CASCADE from cards (card delete removes it from all snapshots) or ON DELETE SET NULL / app-managed cleanup, depending on product choice. Schema below uses CASCADE for snapshot_id and RESTRICT for card_id so snapshot delete cleans up, but card delete fails until snapshot_cards are updated (safe default).

---

## 3. Migration strategy

### 3.1 Version tracking

- **Table: `schema_version`**  
  Single row: `version INTEGER NOT NULL`.  
  The **runner** (application startup): (1) Creates `schema_version` if missing and inserts `version = 0`. (2) Reads current `version`. (3) For each migration file with NNN > current, runs the migration SQL in a transaction, then sets `schema_version.version = NNN`. Migration files contain **only DDL** (and optional data migration); they do not create or update `schema_version`.

- **No down migrations.** Forward-only: each migration file is idempotent where possible (e.g. CREATE TABLE IF NOT EXISTS for initial creation) and only adds or alters schema in a compatible way. Breaking changes are done via new tables/columns and data migration in a later step, not by reverting.

### 3.2 Initial schema creation

- **Runner:** On first run, create `schema_version` if missing: `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);` and ensure one row: `INSERT OR IGNORE INTO schema_version (version) VALUES (0);`.
- **Migration 001:** Create all application tables and indices above; enable FK support if desired (`PRAGMA foreign_keys = ON` is per-connection in SQLite). Do not create or update `schema_version` in the migration file; the runner sets `schema_version.version = 1` after 001 succeeds.

### 3.3 Forward-only migrations

- **Naming:** `NNN_description.sql` (e.g. `002_add_plugin_state.sql`). NNN is the schema version after the migration runs.
- **Execution order:** Sort by NNN; run each where NNN > current schema_version, in order.
- **Content:** Each file contains one or more `CREATE`, `CREATE INDEX`, `ALTER TABLE` (SQLite 3.35+ for ADD COLUMN), or data-migration statements. No DROP or backward-incompatible changes without a separate data migration step.
- **Version update:** After successfully applying migration NNN, set `schema_version.version = NNN`.

### 3.4 Desktop app integration

- **When:** On application startup, after opening the SQLite connection (e.g. in Tauri backend).
- **Steps:**  
  1. Create `schema_version` table if missing; ensure one row with `version = 0` (no schema applied yet).  
  2. Read current `schema_version.version`.  
  3. List migration files (e.g. `001_initial.sql`, `002_*.sql`) sorted by NNN; for each NNN > current version, run the file’s SQL in a transaction; on success, update `schema_version.version = NNN`.  
  4. If any step fails, roll back and surface error (do not advance version).
- **Location of migration files:** e.g. `src-tauri/migrations/` or project root `migrations/`; loaded as embedded resources or from the filesystem next to the binary.

---

## 4. Suggested SQL (initial migration)

Below is the initial migration SQL (version 1). Use as the first migration file; run with `PRAGMA foreign_keys = ON` if you rely on FK enforcement.

**Runner responsibility:** Before running any migration, ensure `schema_version` exists and has one row: `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL); INSERT OR IGNORE INTO schema_version (version) VALUES (0);`. After successfully applying migration NNN, run `UPDATE schema_version SET version = NNN;`.

**Migration 001 (`001_initial.sql`)** — creates all application tables (not `schema_version`):

```sql
-- Migration 001: Initial schema
-- Version after apply: 1. Runner updates schema_version.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  source_plugin_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_source_plugin_id ON cards(source_plugin_id);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS folder_snapshots (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folder_snapshots_folder_id ON folder_snapshots(folder_id);

CREATE TABLE IF NOT EXISTS folder_snapshot_cards (
  snapshot_id TEXT NOT NULL REFERENCES folder_snapshots(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  position INTEGER,
  PRIMARY KEY (snapshot_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_folder_snapshot_cards_card_id ON folder_snapshot_cards(card_id);

CREATE TABLE IF NOT EXISTS group_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('user', 'suggested')),
  suggested_plugin_id TEXT,
  suggested_template_id TEXT,
  rules_json TEXT NOT NULL,
  rule_logic TEXT NOT NULL CHECK (rule_logic IN ('and', 'or')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at);
```

---

## 5. Summary

| Concern | Decision |
|---------|----------|
| Cards | One row per card; id + source_plugin_id + JSON data + updated_at. |
| Folders | folders table; folder_snapshots + folder_snapshot_cards for point-in-time membership. |
| Groups | group_definitions only; rules as JSON; no membership table. |
| Search history | Append-only; query + filters_json + created_at; no FKs. |
| PKs | TEXT for all (ids are strings); composite PK for folder_snapshot_cards. |
| FKs | folders → folder_snapshots → folder_snapshot_cards → cards; group_definitions and search_history standalone. |
| Migrations | Forward-only; schema_version table; NNN_description.sql; run on startup. |

Schema stays simple, debuggable, and extensible without ORMs; all stored data remains JSON-serializable at the application boundary.
