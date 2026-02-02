# Explicit Refresh Behavior

Design for explicit refresh behavior in a local-first, plugin-based desktop application. Card data is fetched from external APIs and cached locally. Cached CardData represents the authoritative “latest refresh” state. There is no automatic background refresh; users explicitly control refresh. Folder contents are snapshot-based and do not auto-update.

---

## 1. User-facing mental model

- **Refresh = “Get the latest data from the source for this scope.”**
- **Latest refresh wins:** The most recent refresh overwrites cached CardData for the refreshed cards.
- **Refresh is explicit:** The system never refreshes on hover, focus, or view changes.
- **Folders are snapshots:** Refreshing a card does not update saved folder snapshots.

---

## 2. Refresh types and triggers

### 2.1 Refreshing a search result set

- **Trigger:** “Refresh results” button on the search results view (global refresh).
- **Scope:** The current result set (or the current search query parameters).
- **Effect:** Re-run the search via the plugin(s), fetch fresh data, normalize to CardData, overwrite cache entries for returned cards.

### 2.2 Refreshing an individual card

- **Trigger:** “Refresh” action on a card (e.g. in card overlay).
- **Scope:** Single card id.
- **Effect:** Fetch latest data for that card via the relevant plugin; overwrite its cached CardData.

**Rule:** Refresh scope is always explicit and visible to the user.

---

## 3. Refresh flow (step-by-step)

### 3.1 Refreshing a result set

1. User clicks “Refresh results.”
2. App determines scope (current search query or current result set).
3. App calls plugin(s) to fetch fresh data for that scope.
4. Plugin returns normalized CardData.
5. App **overwrites** cache entries for each returned card (full replace by card id).
6. UI updates from cache to show refreshed data.
7. Search history records a new entry with `source = "refresh"` (if history is enabled).

### 3.2 Refreshing a single card

1. User clicks “Refresh” on a card.
2. App calls the plugin for that card.
3. Plugin returns normalized CardData.
4. App **overwrites** the cache entry for that card id.
5. UI updates immediately to show the new data.

**Rule:** Refresh writes are full replacements per card id; no merge with previous fields.

---

## 4. Cache overwrite behavior

- **Per-card overwrite:** Each refreshed card fully replaces the cached CardData for that card id.
- **Latest refresh wins:** If two refreshes touch the same card, the last completed refresh determines the cached state.
- **No partial writes:** A card is either fully updated with new CardData or left unchanged (on failure).

**Rule:** Refresh is deterministic: one card id → one CardData blob, replaced on success.

---

## 5. Partial success or failure

### 5.1 Full failure

- If the refresh request fails for the entire scope (e.g. network error), **no cache writes** occur.
- UI shows an error; cached data remains unchanged.

### 5.2 Partial failure (some cards succeed, some fail)

- **Option A (strict, recommended):** Treat any failure as a failed refresh for the scope. Write nothing; show error; cached data unchanged.
- **Option B (best-effort):** Write successful cards only; failed cards remain unchanged. Show “X of Y refreshed; Z failed.”

**Rule:** Choose one policy and surface it explicitly in the UI. Default recommendation: Option A for clarity and trust.

---

## 6. Interaction with other systems

### 6.1 Groups and filters

- Groups are derived from cached CardData. When refresh overwrites card data, group membership is recomputed from cache (no stored membership).
- Active group filters remain active; refreshed cards may enter or leave groups based on updated data.

**Rule:** Refresh never changes the group definitions or the active group selection; it only updates cached data.

### 6.2 Folder snapshots

- Folder contents are snapshots. Refresh does **not** update folder snapshots automatically.
- If a card is refreshed in cache, folder snapshots still show the older snapshot data unless the user explicitly updates the folder content.

**Rule:** Refresh affects cache only; folder snapshots remain unchanged.

### 6.3 Search history

- A refresh action creates a new search history entry (if history is enabled) with `source = "refresh"`.
- Re-running a previous search via history is a separate action and can be “search” (cache) or “refresh” depending on user choice.

**Rule:** Refresh is logged distinctly from cache-based searches.

---

## 7. UX behavior

### 7.1 Loading indicators

- **Result set refresh:** Show a global loading state (e.g. “Refreshing 25 cards…”). Card grid remains visible but indicates refresh in progress.
- **Single-card refresh:** Show a per-card loading state (e.g. spinner on the card or overlay).

### 7.2 Disabled actions during refresh

- Disable the refresh trigger for the scope being refreshed (e.g. disable “Refresh results” while it is running).
- For a card that is currently refreshing, disable its “Refresh” button to prevent duplicate requests.
- Other actions (e.g. Save to folder) remain available unless the product chooses to lock the card during refresh.

**Rule:** Refresh actions are not re-entrant; repeated clicks while a refresh is in progress are ignored or disabled.

---

## 8. Edge cases

### 8.1 Refresh when offline

- The refresh attempt fails (no network). No cache writes occur.
- UI shows “Offline — refresh failed.” Cached data remains visible.

### 8.2 Refresh after cache deletion

- If a card was deleted from cache and the user refreshes a scope that includes it, the card can reappear (fetched from the API and re-cached).
- This is expected: refresh always pulls from source, regardless of prior cache deletion.

---

## 9. Explicit rules index

- **R1.** Refresh is always user-initiated; no implicit refresh on hover or view change.
- **R2.** Refresh scope is explicit (result set or single card).
- **R3.** Successful refresh fully replaces cached CardData for that card id.
- **R4.** Latest refresh wins when multiple refreshes touch the same card.
- **R5.** On full failure, no cache writes occur.
- **R6.** On partial failure, use a single explicit policy (strict or best-effort) and surface it.
- **R7.** Refresh updates cache only; group definitions and folder snapshots are unchanged.
- **R8.** Refresh does not auto-update folder snapshots.
- **R9.** Refresh is logged in search history as `source = "refresh"` (if enabled).
- **R10.** Refresh actions are disabled while in progress for the same scope.

---

## 10. Rationale

| Decision | Rationale |
|----------|-----------|
| **Explicit refresh scope** | Users know exactly what is being refreshed. |
| **Full overwrite per card** | Deterministic; avoids merge bugs and half-updated states. |
| **No implicit refresh** | Avoids hidden background behavior; user-controlled. |
| **Folders unchanged** | Matches snapshot requirement; avoids surprising edits. |
| **Group membership recomputed** | Groups are derived; no stored membership to update. |
| **Disable repeated refresh** | Prevents duplicate requests and inconsistent states. |
| **Offline = no write** | Keeps cache stable and predictable. |

---

## 11. Summary

- **Refresh results** re-runs the current query and overwrites cached CardData for returned cards.
- **Refresh card** updates only that card’s cache entry.
- **Latest refresh wins**; writes are full replacements per card id.
- **Failures**: no writes on full failure; explicit policy for partial failure.
- **Groups** recompute from refreshed cache; **folders** do not auto-update.
- **UI** shows loading and disables refresh actions while in progress.
