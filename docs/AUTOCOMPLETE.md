# Autocomplete System (Debounced, Field-Level)

Design for the autocomplete system in the SvelteKit-based, plugin-driven search application. Search forms are generated from plugin manifests; autocomplete is optional and field-specific. Suggestions may come from plugin-provided functions or cached local data. Autocomplete improves usability but does not trigger searches.

---

## 1. Which fields support autocomplete

### 1.1 Manifest declaration (field-level enablement)

- **Per-field flag:** In **SearchableField**, add an optional **`autocomplete?: boolean`**. When `true`, the form renders autocomplete UI for that field and the frontend may call the plugin’s **autocomplete** function with that field’s current value as the partial query.
- **Default:** If `autocomplete` is omitted or `false`, the field is a normal input with no autocomplete UI and no autocomplete calls.
- **Typical use:** Text-like fields (e.g. free-text query, search terms) opt in; select/number/boolean usually do not. The manifest explicitly lists which fields have autocomplete.

**Rule:** Only fields with `autocomplete: true` in the manifest participate in autocomplete. No implicit “all text fields get autocomplete.”

### 1.2 Plugin capability

- The plugin must implement **autocomplete** (required on the Plugin interface). The frontend only calls it when the focused field has `autocomplete: true` and the user has typed (see §2).
- The plugin may use its own logic (API, local cache, or static list). The frontend does not care; it only calls `autocomplete(partialQuery, context)` and displays the returned suggestions.

---

## 2. Autocomplete API contract (frontend ↔ plugin)

### 2.1 Frontend → plugin

**When the frontend calls:**

- **Trigger:** User has focused a field with `autocomplete: true`, and after debounce (see §3) the current value (e.g. trimmed string) meets the minimum length.
- **Call:** `plugin.autocomplete(partialQuery, context)` where:
  - **partialQuery:** The current value of the autocomplete-enabled field (e.g. the string in the input). Typically trimmed.
  - **context:** `{ filters?: Record<string, unknown> }` — current values of other form fields (filters) so the plugin can narrow suggestions (e.g. “suggestions for category A”). Optional; omit if the form has no other fields or the app does not pass them.

**Request identity / cancellation:** The frontend tracks a “request id” or “version” per field (e.g. increment on each new debounced call). When a response arrives, the frontend compares it to the current version; if the version changed (user typed again), the response is **discarded** (stale). Only the latest response for the current input is applied. No cancellation token is passed to the plugin; the plugin always returns a full result; the frontend ignores late results.

### 2.2 Plugin → frontend

**What the plugin returns:**

- **Type:** `Promise<AutocompleteSuggestion[]>`.
- **AutocompleteSuggestion:** `{ text: string; label?: string; type?: string; payload?: Record<string, unknown> }`.
  - **text:** Value to insert into the field when the user selects this suggestion (e.g. replace or append).
  - **label:** Optional display text (e.g. “Price: 100–200”). If absent, display `text`.
  - **type:** Optional hint for UI styling or behavior (`"term"` | `"filter"` | `"plugin"` | custom).
  - **payload:** Optional JSON-serializable data for the UI (e.g. filter key, plugin id). Frontend may pass it back on select or ignore.

**Rule:** The frontend never sends a “cancel” to the plugin; it only ignores stale responses. The plugin does not need to support cancellation.

---

## 3. Debounce and cancellation strategy

### 3.1 Debounce timing

- **Delay:** Wait **200–300 ms** after the last input change before calling `plugin.autocomplete(partialQuery, context)`. Recommended default: **250 ms**.
- **Scope:** Per field. Each autocomplete-enabled field has its own debounce timer; typing in field A does not reset the timer for field B.
- **Reset:** On each keystroke (or change) in that field, clear the previous timer and start a new 250 ms timer. When the timer fires, if the field still has focus and the value meets min length, call autocomplete.

**Rule:** No request is sent until the user has paused for the debounce delay. This reduces calls and improves responsiveness by not firing on every keystroke.

### 3.2 Minimum input length

- **Default:** Require at least **1 character** (after trim) before calling autocomplete. Optionally **2** to further reduce noise; document the choice.
- **Empty input:** If the user clears the field or the value is empty after trim, do not call autocomplete. Clear any visible suggestions (or close the dropdown).

**Rule:** No autocomplete request when `partialQuery` (trimmed) length &lt; minimum (e.g. 1). This avoids “suggest everything” and unnecessary work.

### 3.3 Cancellation of stale requests

- **No abort signal passed to plugin:** The plugin interface does not take an AbortSignal; the plugin runs to completion.
- **Stale response handling:** The frontend keeps a **version** (e.g. integer) for the field: increment on each debounced invocation. When a request is sent, store the version at send time. When the response arrives, compare response version to current version. If they differ (user typed again and a new request was sent), **discard** the response. Only apply suggestions when the response version matches the current version.
- **Result:** Only the latest response for the current input is shown. Out-of-order or slow responses do not overwrite newer suggestions. Behavior is deterministic and predictable.

**Rule:** Never apply suggestions from a response that is older than the latest request for that field.

---

## 4. Data flow (input change → suggestions)

1. **User focuses** an autocomplete-enabled field (manifest: `autocomplete: true`).
2. **User types** → frontend updates the field value (form state) and starts/resets the debounce timer for that field.
3. **After debounce delay** (e.g. 250 ms) with no new input:
   - If trimmed value length &lt; min length (e.g. 1): do not call plugin; clear suggestions and close dropdown if open.
   - Else: increment version, call `plugin.autocomplete(trimmedValue, { filters: currentFormFilters })`, and store the version for this request.
4. **When the promise resolves:** If the response version matches the current version, set suggestions for that field and show the dropdown. If not, discard.
5. **User selects a suggestion** (keyboard or mouse): set the field value to `suggestion.text` (or apply plugin-defined behavior), close the dropdown, and optionally emit a select event with `suggestion.payload`. Do not trigger a search.
6. **User clears the field or blurs without selecting:** Close the dropdown and clear suggestions. Do not trigger a search.

**Rule:** Autocomplete never triggers a search. Submission is explicit (e.g. Submit button).

---

## 5. Display and selection of suggestions

### 5.1 Display

- **Container:** A dropdown (or list) attached to the input (e.g. below it), positioned so it does not overflow the viewport. Prefer a single, predictable position (e.g. below, same width as input).
- **Content:** One row per suggestion. Show `suggestion.label ?? suggestion.text`. Optionally use `suggestion.type` for styling (e.g. icon or color).
- **Empty set:** If the plugin returns `[]`, show nothing (close dropdown or show “No suggestions” — product choice; recommend “close dropdown” for simplicity).
- **Max height:** Cap the list height (e.g. 5–8 items) and scroll. Avoid covering the whole screen.

### 5.2 Selection (keyboard)

- **Arrow Down / Arrow Up:** Move highlight to next/previous suggestion. Wrap or stop at ends (document the choice; recommend stop at ends).
- **Enter:** Apply the highlighted suggestion (set field to `suggestion.text`, close dropdown). If no highlight, optional: do nothing or submit form (recommend do nothing).
- **Escape:** Close the dropdown and clear highlight. Do not change the field value.
- **Tab:** Close the dropdown and accept current field value (no suggestion applied). Optionally move focus to next field.
- **Focus:** When the dropdown is open, keep focus on the input so that keyboard events are handled in the same component (no global listeners). Use a single component that owns input + dropdown and handles keydown.

**Rule:** All keyboard behavior is handled inside the autocomplete component (input + dropdown). No global key listeners.

### 5.3 Selection (mouse)

- **Click on a suggestion:** Set field value to `suggestion.text`, close dropdown, and optionally emit select with `suggestion.payload`. Do not trigger search.
- **Click outside (input and dropdown):** Close dropdown; keep field value unchanged.

### 5.4 Clearing or overriding suggestions

- **User keeps typing:** Debounce resets; when the new request completes, new suggestions replace the old ones. User can override any suggestion by typing.
- **User clears the field:** Clear suggestions and close dropdown; do not call autocomplete for empty input.
- **User selects a suggestion:** Field value is set to `suggestion.text`; dropdown closes. User can edit the value afterward; next debounced change will fetch new suggestions.

**Rule:** Suggestions are always derived from the current field value (and context). User can always type over or clear; no “lock-in” to a suggestion.

---

## 6. Error and fallback behavior

### 6.1 Plugin autocomplete failure

- **Plugin throws or rejects:** Catch the error. Do not update suggestions; close the dropdown or leave it closed. Optionally show a transient message (e.g. “Suggestions unavailable”). Do not block input or form submission.
- **Rule:** Failure is non-fatal. The user can keep typing and submit the form; autocomplete is an enhancement.

### 6.2 Empty suggestion set

- **Plugin returns `[]`:** Treat as “no suggestions.” Close the dropdown or show an empty state (e.g. “No suggestions”). Do not show an error; empty is valid.
- **Rule:** Empty list is not an error. No retry or fallback call.

### 6.3 Timeout (optional)

- If the product wants a timeout (e.g. 3 s), treat timeout like failure: discard response, close dropdown, optionally show “Suggestions unavailable.” Do not block input. Document timeout value if used.

---

## 7. Performance constraints

### 7.1 Avoid excessive API calls

- **Debounce:** 250 ms (or 200–300 ms) ensures we do not call on every keystroke.
- **Min length:** 1 (or 2) character(s) avoids calls for empty or single-character “noise.”
- **Stale discard:** Only one response per “version” is applied; we do not process every in-flight response. This reduces work and avoids flicker.

**Rule:** The only way to trigger a call is user input in an autocomplete-enabled field, after debounce, with min length met. No background or periodic calls.

### 7.2 Prefer cache-backed suggestions when available

- **Plugin responsibility:** The plugin may return suggestions from local cache (e.g. recent searches, cached API response). The frontend does not distinguish; it just calls `autocomplete(partialQuery, context)` and displays the result.
- **Frontend:** No separate “cache vs network” UI unless the plugin encodes it in `suggestion.type` or `payload` and the UI chooses to show it. Prefer simple display; fast responses (from cache) naturally improve UX without frontend logic.

**Rule:** Cache is an implementation detail of the plugin. The contract is “return suggestions”; frontend stays agnostic.

---

## 8. UX behavior summary

| User action | System response |
|-------------|-----------------|
| Focus autocomplete field | No request yet. |
| Type in field | Update value; start/reset debounce. |
| Pause ≥ debounce, length ≥ min | Call plugin autocomplete; on response (if not stale), show dropdown. |
| Type again before response | Reset debounce; when old response arrives, discard (stale). |
| Arrow Up/Down | Move highlight in list. |
| Enter | Apply highlighted suggestion; close dropdown. |
| Escape | Close dropdown; clear highlight. |
| Click suggestion | Apply suggestion; close dropdown. |
| Click outside | Close dropdown. |
| Clear field | Clear suggestions; close dropdown. |
| Submit form | Submit search (explicit); autocomplete does not trigger search. |

---

## 9. Rationale

| Decision | Rationale |
|----------|------------|
| **Field-level `autocomplete: true`** | Explicit opt-in; no surprise autocomplete on every text field. Plugin author controls which fields get it. |
| **Debounce 200–300 ms** | Balances responsiveness and call volume; 250 ms is a common default. |
| **Min length 1 (or 2)** | Avoids “suggest everything” and pointless calls; keeps UI predictable. |
| **Version-based stale discard** | Simple, no AbortSignal in plugin contract; works with any plugin. Deterministic: only latest response wins. |
| **No global listeners** | All behavior in the autocomplete component; easier to reason about and avoid leaks. |
| **Keyboard in component** | Same component owns input and dropdown; keydown handled locally. Predictable and idiomatic Svelte. |
| **Autocomplete never triggers search** | Matches “explicit search” requirement; no surprise searches. |
| **Failure non-fatal** | User can always type and submit; autocomplete is additive. |
| **Empty list = close / “No suggestions”** | Not an error; simple and low cognitive load. |
| **Cache inside plugin** | Frontend stays simple; plugin can use cache without contract change. |

---

## 10. Summary

- **Manifest:** Add **`autocomplete?: boolean`** to SearchableField; when `true`, that field gets autocomplete UI and participates in autocomplete calls.
- **API:** Frontend calls **`plugin.autocomplete(partialQuery, { filters })`**; plugin returns **`Promise<AutocompleteSuggestion[]>`**. Frontend discards stale responses by version; no cancel token.
- **Debounce:** 250 ms after last change; min length 1 (or 2); per-field timer and version.
- **UX:** Dropdown with keyboard (arrows, Enter, Escape, Tab) and mouse selection; no global listeners; autocomplete does not trigger search.
- **Errors:** Plugin failure or empty list → non-fatal; close dropdown or show “No suggestions.” No retry required.
- **Performance:** Debounce + min length + stale discard; cache is plugin-internal.
