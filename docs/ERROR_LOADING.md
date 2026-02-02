# Error & Loading States

Design for error handling and loading states in the local-first, plugin-based desktop application. The app uses local operations plus external API calls via plugins, caches data locally, and relies on explicit user refresh. Reliability and user trust are priorities.

---

## 1. Loading state taxonomy

### 1.1 Initial app load

**What is loading:** App shell initialization, plugin discovery, local cache open.  
**Indicator:** Global app-level loading indicator (e.g. “Loading…” in the main content area).  
**Rule:** Initial load can block the main view because the app is not yet usable.

### 1.2 Search execution

**What is loading:** User-initiated search (plugin call and cache write).  
**Indicator:** Localized in the results area (e.g. spinner above results with “Searching…”).  
**Rule:** Do not block the entire UI; show previous cached results if present while new search is in progress (stale view is allowed).

### 1.3 Autocomplete requests

**What is loading:** Debounced autocomplete call per field.  
**Indicator:** Inline (e.g. small spinner inside the input or dropdown).  
**Rule:** Do not block the input; user can keep typing while autocomplete loads.

### 1.4 Card hover enrichment (cache reads only)

**What is loading:** Nothing; hover reads cache only.  
**Indicator:** None.  
**Rule:** If cache data is missing for the hovered card, show a minimal “Not in cache” state, not a spinner.

### 1.5 Refresh actions

**Global refresh (result set):**  
**Indicator:** Localized banner or spinner near the results area (e.g. “Refreshing 25 cards…”).  
**Rule:** Results remain visible during refresh; actions for the refresh scope are disabled.

**Per-card refresh:**  
**Indicator:** Spinner or progress state on the card (or in overlay).  
**Rule:** Only the card being refreshed is disabled; other cards remain interactive.

---

## 2. Error taxonomy and handling rules

### 2.1 API failures

**Examples:** 500, 404 for a card, timeout.  
**Handling:**  
- Show an inline error in the affected scope (search results banner or per-card error).  
- Leave cached data visible; do not clear results.  
- Provide a “Retry” action if appropriate.

### 2.2 Network / offline conditions

**Examples:** No network, DNS failure, offline mode.  
**Handling:**  
- Show a clear offline message (e.g. “Offline — using cached data”).  
- Do not clear existing data; keep cached results visible.  
- Allow retry when connectivity returns (manual).

### 2.3 Plugin errors

**Examples:** Plugin throws during search, autocomplete, or refresh.  
**Handling:**  
- Surface the error at the smallest relevant scope (inline in search panel or per-card).  
- Label the plugin (e.g. “Plugin ‘Coins’ failed”).  
- Keep cached data visible; do not wipe.

### 2.4 Data parsing / normalization errors

**Examples:** Invalid response, schema mismatch, normalization failure.  
**Handling:**  
- Treat as a plugin error for the affected items.  
- Do not write partial or corrupt data to cache.  
- Surface error inline; allow retry.

---

## 3. UX behavior guidelines

### 3.1 Loading indicators

- **Global only for app init.** All other loading states are localized to their area (search results, autocomplete dropdown, individual card).
- **No overlay blocking** for localized operations.  
- **Explicit labels** (e.g. “Searching…”, “Refreshing 12 cards…”) to reduce ambiguity.

### 3.2 Error surfacing

- **Inline over global** for localized failures.  
  - Search error → banner above results.  
  - Autocomplete error → small inline message near input or dropdown.  
  - Per-card refresh error → small error indicator on that card.  
- **Global error** reserved for app-init failure (e.g. cache open failed or plugins cannot load).

### 3.3 Retry and recovery

- **Search / refresh:** Provide a retry button in the same context.  
- **Autocomplete:** Automatic retry is not required; user can continue typing or re-focus to trigger a new request.  
- **Offline:** Provide a “Try again” action or a “Refresh when online” hint.

---

## 4. State transitions

### 4.1 Loading → success

- Replace loading indicator with new data.  
- Keep scroll position and selection where possible; avoid full view reset.

### 4.2 Loading → partial success

- If partial success is allowed (best-effort refresh):  
  - Update items that succeeded.  
  - Show a warning banner (e.g. “11 of 12 refreshed; 1 failed”).  
  - Keep stale items visible for failed ones.

### 4.3 Loading → error

- Show error inline; keep existing cached data visible.  
- Do not clear or reset the view.  
- If the operation failed fully, no cache writes occur.

---

## 5. Consistency rules

- **Cached data stays visible** during errors and loading states.  
- **No flicker or empty states** when a request fails; keep existing content.  
- **No implicit retries**; retries are user-initiated.  
- **Localized failures do not block the app** (e.g. autocomplete failure doesn’t block search).

---

## 6. Loading state taxonomy (summary)

| Area | Loading indicator | Scope | Blocks UI? |
|------|-------------------|-------|-----------|
| App init | Global “Loading…” | Whole app | Yes (only at startup) |
| Search | Banner/spinner above results | Results area | No |
| Autocomplete | Inline spinner in input/dropdown | Field | No |
| Hover | None | N/A | No |
| Refresh (global) | Banner above results | Results area | No |
| Refresh (card) | Spinner on card/overlay | Card | No |

---

## 7. Error taxonomy (summary)

| Error type | Scope | User message | Cached data |
|------------|-------|--------------|-------------|
| API failure | Search or card | Inline error + retry | Remains visible |
| Offline | Global or search | “Offline — using cached data” | Remains visible |
| Plugin error | Search/card/autocomplete | Inline + plugin name | Remains visible |
| Normalization error | Search/card | Inline error | Remains visible |

---

## 8. Rationale

| Decision | Rationale |
|----------|-----------|
| **Localized loading** | Prevents whole-app blocking; keeps UI responsive. |
| **Cached data persists on error** | Builds trust; avoids sudden blank states. |
| **Inline errors** | Keeps context and reduces cognitive load. |
| **No implicit retries** | User remains in control; avoids hidden behavior. |
| **App init can block** | App isn’t usable until cache/plugins are ready. |
| **Hover has no loading** | Hover is cache-only; no fetch. |

---

## 9. Summary

- Loading is localized except for initial app load.  
- Errors are surfaced inline at the smallest possible scope.  
- Cached data remains visible during errors and loading.  
- Refresh and search allow manual retry; no implicit retries.  
- Hover is cache-only and never shows loading.  
- UI stays calm and predictable; no full reset on failure.
