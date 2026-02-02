# Search History: Logging Model & Queries

Search history for the local-first desktop search application. History supports **user recall**, **transparency**, and **optional reuse**. It is not analytics or tracking. All searches are initiated explicitly by the user; there is no background tracking.

---

## 1. What constitutes a “search event”

A **search event** is one row recorded when the user runs a search. It captures only what was asked and when, not what was returned.

| Field | Description | Rationale |
|-------|-------------|-----------|
| **id** | Unique record id (e.g. UUID). | Stable reference for re-run and display. |
| **plugin_id** | Plugin that was used for this search (e.g. `"example"`, `"coins"`). | Supports filter-by-plugin and re-run with same plugin. |
| **query** | Free-text query string the user entered. | Human-readable; core of “what was searched.” |
| **filters** | Key-value map of searchable field id → value (e.g. `{ "category": "a", "minValue": 100 }`). Values are JSON-serializable (string, number, boolean, or string[]). | Full picture of the search; supports re-run and transparency. |
| **created_at** | ISO 8601 timestamp when the search was run. | Ordering, “recent” list, and retention. |
| **source** | Whether results were served from **cache** or from a **refresh** (API/source). | Transparency: user sees “from cache” vs “fresh from source.” |

**Optional fields** (if product needs them):

- **sort_by** / **sort_order**: If the UI exposes sort and re-run should preserve it.
- **limit**: If the UI exposes page size and re-run should preserve it.

Out of scope here: result count, card ids, or any result data.

---

## 2. Persistence model

- **Append-only:** One row per search event. No updates to existing rows.
- **No updates or deletes required** for core behavior. Optional: user can “Clear history” (delete rows) or retention policy can delete oldest rows; both are explicit operations, not background tracking.
- **No foreign keys** to cards, groups, or plugins. History is standalone; human-readable and self-contained.
- **Storage:** One table (e.g. `search_history`). Columns map to the fields above: `id`, `plugin_id`, `query`, `filters` (e.g. stored as JSON text), `created_at`, `source` (`"cache"` | `"refresh"`). Existing schema may only have `id`, `query`, `filters_json`, `created_at`; add `plugin_id` and `source` to match this model.

---

## 3. History record schema (conceptual)

**SearchHistoryRecord** (conceptual; persistence uses the same fields in a single table):

```
id: string
plugin_id: string
query: string
filters: Record<string, string | number | boolean | string[]>  // optional; omit if empty
created_at: string   // ISO 8601
source: "cache" | "refresh"
```

- **id:** Unique, stable (e.g. UUID). Generated when the event is recorded.
- **plugin_id:** Which plugin handled the search. Required.
- **query:** User’s free-text query. Required (may be empty string).
- **filters:** Searchable field id → value. Omit or empty object if no filters. Stored as JSON.
- **created_at:** When the search was executed. ISO 8601.
- **source:** `"cache"` = results came from local cache; `"refresh"` = results came from API/plugin (refresh path). Recorded at write time from the execution path.

All fields are JSON-serializable. No card snapshots, no group membership, no valuations.

---

## 4. Example history entries

**Example 1 — Free-text only, from cache**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "plugin_id": "example",
  "query": "rare coin",
  "filters": {},
  "created_at": "2025-02-01T14:30:00.000Z",
  "source": "cache"
}
```

**Example 2 — Query + filters, from refresh**

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "plugin_id": "example",
  "query": "Morgan dollar",
  "filters": {
    "category": "a",
    "minValue": 100
  },
  "created_at": "2025-02-01T14:35:00.000Z",
  "source": "refresh"
}
```

**Example 3 — Empty query, filters only**

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "plugin_id": "coins",
  "query": "",
  "filters": {
    "year": 1921,
    "grade": "VF"
  },
  "created_at": "2025-02-01T14:40:00.000Z",
  "source": "cache"
}
```

These are human-readable and sufficient for recall, transparency, and re-run. No card ids, result counts, or valuations.

---

## 5. History queries (patterns for the History tab)

### 5.1 List recent searches

- **Purpose:** Show the user their last N searches (e.g. in a History tab).
- **Pattern:** Order by `created_at` descending; limit N (e.g. 50).
- **Input:** Optional limit (default e.g. 50).
- **Output:** List of SearchHistoryRecord, newest first.
- **Use:** Populate the History list; display plugin_id, query, filters (summary), created_at, source.

### 5.2 Filter by plugin

- **Purpose:** “Show only searches for plugin X.”
- **Pattern:** Same as list recent, with `plugin_id = :plugin_id` (or `plugin_id IN (...)` if multi-select).
- **Input:** plugin_id (required); optional limit.
- **Output:** List of SearchHistoryRecord for that plugin, newest first.
- **Use:** History tab filter dropdown or sidebar.

### 5.3 Re-run a previous search

- **Purpose:** Execute the same search again (same plugin, query, filters).
- **Pattern:** Read one record by id; build SearchQuery from `query`, `filters`, and `plugin_id`; call search pipeline with that SearchQuery (and optional limit/sort if stored).
- **Input:** History record id.
- **Output:** Not from history; the search pipeline returns SearchResult (cards from cache or refresh, per cache strategy).
- **Use:** “Run again” or “Re-run” on a history row. No need to store results in history.

**Re-run semantics:** Re-run uses the **current** cache/refresh behavior (e.g. user choice or default). History only records what was asked; it does not record whether the *next* re-run will hit cache or refresh. Transparency is preserved by showing `source` for the **original** run.

---

## 6. Retention rules

### 6.1 Unlimited vs capped

- **Unlimited (default):** Keep all search events until the user clears history or the app is reset. Simple and transparent; no silent deletion.
- **Capped (optional):** If the product wants a limit:
  - **By count:** Keep only the last N rows (e.g. 500). When inserting, if count &gt; N, delete oldest (by `created_at`). Apply only at write time or via a periodic cleanup; document the cap in settings or docs.
  - **By time:** Keep only rows with `created_at` within the last K days (e.g. 90). Periodically or at write time delete older rows. Document K.
- **Recommendation:** Start with unlimited; add a cap only if needed, and make it visible (e.g. “Keep last 500 searches” in settings).

### 6.2 Optional manual clearing

- **Clear all:** User action (e.g. “Clear history”) deletes all rows in the history table. No confirmation required by this design; product may add one.
- **Clear range:** Optional (e.g. “Clear older than 30 days”) as a separate action; not required for core behavior.
- **Rule:** Clearing is explicit user (or admin) action. No background deletion of history for “privacy” unless the user opted in (e.g. “Clear on exit”); if so, document it clearly.

---

## 7. What history explicitly does NOT store

| Not stored | Reason |
|------------|--------|
| **Card snapshots** | History is “what I searched,” not “what I got.” Keeps records small and avoids coupling to card lifecycle. |
| **Card ids or result set** | Same as above; re-run produces a new result set from current data. |
| **Group membership** | Groups are derived from CardData; history is independent of groups. |
| **Valuations** | Results (including valuations) live in cache/cards; history does not duplicate them. |
| **Result count** | Optional for UI (“you saw 12 results”); not required for recall or re-run. Omit for simplicity. |
| **Analytics or telemetry** | No events for “hover,” “click,” or “time on page.” No background tracking. |

History remains a minimal, human-readable log of **user-initiated searches** only.

---

## 8. When to write a history record

- **Trigger:** Exactly when the user executes a search (e.g. clicks “Search” or “Refresh” on the search form).
- **Once per action:** One search execution ⇒ one new row. No duplicate rows for the same click; no writing on hover, navigate, or focus.
- **After execution:** Write the record after the search has been run (and we know `source`: cache vs refresh). If the search fails (e.g. plugin error), product may still write a record with `source` and optional error flag, or skip writing; recommend writing so the user sees “I tried this and it failed” in history.

**Rule:** Write only when the user explicitly runs a search. No background or implicit writes.

---

## 9. Rationale

| Decision | Rationale |
|----------|------------|
| **Append-only, no updates** | Simple, auditable, and predictable. “What I searched” does not change after the fact. |
| **Include plugin_id and source** | Supports filter-by-plugin and transparency (cache vs refresh) without storing results. |
| **Store query + filters in full** | Human-readable and enough to re-run; favors transparency over compactness. |
| **No card/group/valuation data** | Keeps history small and independent of cache schema; avoids staleness and privacy surface. |
| **Re-run = reconstruct SearchQuery** | Re-run uses current cache/refresh behavior; history stays a log, not a result store. |
| **Unlimited by default, optional cap** | Builds trust (no silent deletion); cap is optional and should be visible. |
| **Clear = explicit user action** | No background clearing unless the user opts in and it’s documented. |
| **One write per search execution** | No double writes, no tracking of non-search actions. |

---

## 10. Summary

- **Search event:** id, plugin_id, query, filters, created_at, source (cache | refresh).
- **Persistence:** Append-only table; one row per search; no FKs to cards/groups; optional columns for sort/limit.
- **Queries:** List recent (by created_at DESC); filter by plugin_id; re-run by id (build SearchQuery from record).
- **Retention:** Unlimited by default; optional cap (count or time) and optional manual clear; all explicit.
- **Does not store:** Card snapshots, card ids, group membership, valuations, or any analytics.

History is a minimal, human-readable log for recall, transparency, and reuse, with no background tracking.
