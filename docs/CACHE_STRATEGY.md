# Cache Strategy & Refresh Semantics

Caching and refresh behavior for the local-first desktop search application. Data is fetched from external APIs via plugins and cached in SQLite. CardData is the canonical representation. There is no background refresh or automatic invalidation; the user explicitly controls refresh.

---

## 1. Cache lifecycle

### 1.1 When data is fetched from APIs

- **Trigger:** Only in response to an explicit user action that implies “get latest from source” (e.g. “Search”, “Refresh”, “Enrich”).
- **Flow:**
  1. User performs an action that requires data from an API (e.g. run search, refresh current view).
  2. Application calls the appropriate plugin (search / enrich / etc.).
  3. Plugin calls the external API (or local source) and returns raw results.
  4. Plugin normalizes results to CardData.
  5. Application writes the resulting CardData to the cache (SQLite) for the scope of the operation (see §2).
- **Rule:** No fetch is initiated by the system without a user-initiated action that clearly implies a fetch (e.g. clicking “Search” or “Refresh”).

### 1.2 When cached data is reused

- **Trigger:** Any read path that needs card data (e.g. display search results, open a folder snapshot, show hover details, list cards in a group).
- **Flow:**
  1. Application needs CardData for a given card id(s) or set (e.g. result set, snapshot).
  2. Application reads from the cache (SQLite) only. No API call is triggered by the read.
  3. If a requested card id is missing from the cache, the application treats it as absent (e.g. show “not in cache” or omit from list). It does not automatically fetch from the API.
- **Rule:** Reads are served from cache only. Cache miss ⇒ no automatic fetch; user must perform an action that triggers a fetch (e.g. search again, refresh) to populate or update the cache.

---

## 2. Refresh semantics

### 2.1 What “Refresh” means

- **Refresh** is an explicit user action (e.g. “Refresh” button, “Refresh this folder”, “Refresh search results”).
- **Scope:** Refresh applies to a well-defined scope chosen by the user or by the current context (e.g. “current search results”, “this folder’s cards”, “all cards from plugin X”). The UI must make the scope clear (e.g. “Refreshing 12 cards…”).

### 2.2 What happens when the user clicks “Refresh”

1. Application determines the **refresh scope** (set of card ids or “all cards for plugin X” or “current result set”).
2. For each card in scope, application (via plugin) requests fresh data from the API (or source).
3. Plugin returns normalized CardData per card (or a batch).
4. Application **overwrites** the cache entry for each returned card by card id (see §2.3).
5. After all writes, the UI updates to show the new data from the cache.
6. If the operation fails or is partial, see §5.

**Rules:**

- R1. Refresh is always explicit; there is no automatic or time-based refresh.
- R2. Only cards in the refresh scope are updated; other cache entries are unchanged.
- R3. The result of a successful refresh is the new source of truth for the refreshed cards.

### 2.3 How cached CardData is overwritten

- **Key:** Card id (CardData.id). One cache row per card id.
- **Write:** For each CardData item returned by a refresh (or search/enrich), the application **replaces** the existing cache row for that card id with the new CardData. No field-level merge.
- **Rule:** Latest write per card id is authoritative. Previous version is fully replaced; no merge of old and new fields.

### 2.4 Conflicts and partial updates

- **No merge:** We do not merge API response with existing cache (e.g. “only update price”). We replace the whole card for that id.
- **Partial refresh (scope):** If the user refreshes a subset of cards (e.g. “current 10 results”), only those 10 are updated; the rest of the cache is unchanged.
- **Partial refresh (failure):** If some cards in the scope fail to fetch (e.g. API error for one card), see §5. We do not write a “partial” card (e.g. half-updated). Either the card is written with full new CardData or the card is not written.

**Rules:**

- R4. One card id ⇒ one full CardData blob. No partial or merged updates.
- R5. On refresh, either a card is updated with complete new data or it is left unchanged (e.g. on failure for that card).

---

## 3. Hover behavior

### 3.1 Whether hovering can trigger API calls

- **Default rule:** Hover does **not** trigger an API call. Hover is a read-only operation.
- **Rationale:** Keeps behavior predictable and avoids hidden network usage. User expects “hover = show what we have,” not “hover = fetch.”

### 3.2 How hover reads interact with the cache

1. User hovers over a card (or card placeholder).
2. Application needs data to show the hover overlay (e.g. title, valuations, thumbnail).
3. Application reads the cache by card id. If the card is in the cache, show that CardData (or a subset of fields). If the card is not in the cache, show a minimal state (e.g. “Not in cache” or id only) and do not fetch.
4. No cache write and no API call are triggered by hover.

**Rules:**

- R6. Hover uses cache only. No API call on hover.
- R7. Cache miss on hover ⇒ show absence (or minimal info); do not trigger fetch.

### 3.3 Optional: “Enrich on hover”

- If the product later adds “enrich this card on hover” (e.g. fetch latest price), that must be:
  - An explicit user setting (e.g. “Allow fetch on hover”) or an explicit action (e.g. “Get latest” on hover), and
  - Clearly indicated in the UI (e.g. loading state, “Fetching…”).
- Out of scope for this document: current design is hover = cache read only.

---

## 4. Staleness rules

### 4.1 How long cached data remains valid

- Cached data is **valid until it is replaced or removed** by a user-triggered action (e.g. refresh, delete, re-import). There is no time-based invalidation.
- **Rule:** No TTL, no “stale after N minutes.” Cache does not auto-expire.

### 4.2 Whether timestamps are tracked

- **Yes.** Each cache row has an `updated_at` (or equivalent) set at write time (e.g. when the card was last written to the cache).
- **Use of timestamps:**
  - **Display:** UI may show “Updated at &lt;time&gt;” for transparency.
  - **Debugging:** Support and logs can use it to reason about when data was last updated.
  - **Not used for:** Automatic invalidation, background refresh, or “stale” flags. Staleness is not a system concept; the user decides when to refresh.

**Rules:**

- R8. Cache entries do not expire by time. They are valid until overwritten or deleted.
- R9. `updated_at` is stored and may be shown; it is not used to trigger refresh or invalidation.

---

## 5. Failure behavior

### 5.1 API failure during refresh

- **Scenario:** User triggers refresh; the API (or plugin) fails for the whole scope (e.g. network error, auth error, server 500).
- **Behavior:**
  1. Do not write any new data to the cache for that refresh scope.
  2. Leave the cache unchanged for all cards that were in scope.
  3. Show a clear error to the user (e.g. “Refresh failed: &lt;reason&gt;”). Optionally surface retry.
- **Rule:** On full-scope failure, cache is unchanged; user sees error and can retry.

### 5.2 Partial refresh results (some cards succeed, some fail)

- **Scenario:** Refresh scope has N cards; the API returns data for M &lt; N (e.g. one card 404, or one request times out).
- **Behavior (recommended):**
  1. **Option A (strict):** Treat any failure in scope as a failed refresh. Write nothing for the scope; show error (e.g. “Refresh failed for 1 of 12 cards”). Cache unchanged. User can retry.
  2. **Option B (best-effort):** Write only the cards that succeeded; do not write failed cards. Show a warning (e.g. “Refreshed 11 of 12 cards; 1 failed”). Cache is updated for the 11; the 1 remains at previous state.
- **Recommendation:** Option A for simplicity and “latest refresh is authoritative”: either the user’s refresh fully succeeds for the scope or it does not; no mixed state. If the product prefers best-effort (Option B), it must be explicit in the UI (e.g. “X of Y updated”) and in docs.

**Rules:**

- R10. On full refresh failure: no cache writes; show error; cache unchanged.
- R11. On partial failure: either (A) write nothing and show error, or (B) write only successes and show clear “X of Y updated” / “Z failed.” Document and UI must make the chosen behavior clear.

### 5.3 Plugin or normalization errors

- If the plugin throws or normalization fails for a card:
  - Do not write that card to the cache.
  - If the rest of the scope succeeded, apply the same rule as §5.2 (all-or-nothing vs best-effort).
  - Surface error (e.g. “Could not refresh card &lt;id&gt;: &lt;reason&gt;”).

---

## 6. Cache flow summary

### 6.1 Read path (e.g. show results, hover, open folder)

1. Resolve which card ids are needed.
2. Read from cache (SQLite) by id(s).
3. Return cached CardData (or “absent” for missing ids).
4. No API call, no cache write.

### 6.2 Write path (search / refresh / enrich)

1. User action implies “get data” (search, refresh, enrich).
2. Call plugin; plugin may call API; plugin returns normalized CardData.
3. For each returned CardData: upsert cache by card id (full replace), set `updated_at`.
4. On failure (full or partial per policy): apply §5; no write for failed cards (and optionally no write for whole scope).
5. UI updates from cache after write.

### 6.3 No background behavior

- No periodic refresh.
- No “refresh on focus” unless the user explicitly configures it (and it is clearly labeled).
- No implicit fetch on navigate or hover.
- All fetches are tied to an explicit user action and, where applicable, a clear scope.

---

## 7. Rationale

| Choice | Rationale |
|--------|------------|
| **Reads from cache only** | Predictable: user sees what’s stored. No surprise network or latency on hover/list. |
| **Refresh is explicit and scoped** | User stays in control; scope is transparent (“refreshing these 12 cards”). |
| **Full replace per card** | Simple, deterministic: one version per card id. No merge bugs or “half-updated” state. |
| **No TTL / no auto-invalidation** | No hidden behavior; cache only changes when the user does something. |
| **Timestamp for display only** | Transparency (“last updated at …”) without using it for automatic decisions. |
| **Failure ⇒ no write (or best-effort with clear UI)** | User trusts that “Refresh” either updates what they see or tells them it failed; no silent partial state unless explicitly designed (Option B). |
| **Hover = cache only** | Avoids hidden API calls and keeps hover fast and deterministic. |

---

## 8. Explicit rules index

- **R1.** Refresh is always explicit; no automatic or time-based refresh.
- **R2.** Only cards in the refresh scope are updated; other cache entries are unchanged.
- **R3.** Successful refresh result is the new source of truth for refreshed cards.
- **R4.** One card id ⇒ one full CardData; no partial or merged updates.
- **R5.** On refresh, each card is either fully updated or left unchanged (e.g. on failure).
- **R6.** Hover uses cache only; no API call on hover.
- **R7.** Cache miss on hover ⇒ show absence; do not trigger fetch.
- **R8.** Cache entries do not expire by time.
- **R9.** `updated_at` is stored and may be shown; not used for invalidation.
- **R10.** On full refresh failure: no cache writes; show error.
- **R11.** On partial failure: either no writes + error, or write successes only + clear “X of Y” message; behavior must be documented and visible in UI.
