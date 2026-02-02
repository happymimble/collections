# Card Grid & Hover Overlay Component System

Design for the card grid and hover/focus overlay in the SvelteKit-based desktop web application. Search results, group-filtered views, and folder views display cards; each card represents a normalized **CardData** object. Cards support rich on-hover (and on-focus) information display. Hover reads cache only; no API calls on hover.

---

## 1. Component hierarchy and responsibilities

### 1.1 Hierarchy

```
CardGrid (or parent view)
  └── [Card] × N  (or VirtualCardList → [Card])
        └── CardSummary (always visible)
        └── CardOverlay (visible on hover or focus)
              └── OverlayContent (title, subtitle, valuations, tags, actions)
```

- **CardGrid:** Container for the grid layout. Receives `cards: CardData[]` and optional configuration (e.g. columns, virtualization threshold). Renders a list of **Card** components (or a virtual list wrapper that renders **Card** for visible items only). Does not own card data; it receives cards from the parent (search result, group view, folder view).
- **Card:** Single card. Receives `card: CardData` and optional callbacks (e.g. onSaveToFolder, onDelete, onRefresh). Renders **CardSummary** (always visible) and **CardOverlay** (visible when hovered or focused). Emits events for actions; does not perform actions itself.
- **CardSummary:** Minimal always-visible content: title (required), optional thumbnail (imageUrl), optional subtitle. No side effects; purely presentational.
- **CardOverlay:** Rich content shown on hover or focus. Receives the same `card: CardData` (from cache; no fetch). Renders **OverlayContent**: full title, subtitle, valuations (key-value list), tags, optional customFields summary, and action buttons (Save to folder, Delete, Refresh). Overflow and long content handled inside the overlay (see §3.3).

### 1.2 Responsibilities

| Component | Responsibility | Does not |
|-----------|----------------|----------|
| **CardGrid** | Layout, optional virtualization, pass cards to Card | Fetch data, manage card state |
| **Card** | Hold hover/focus state, show/hide overlay, forward actions | Fetch data, perform save/delete/refresh |
| **CardSummary** | Display minimal card fields | Trigger overlay, side effects |
| **CardOverlay** | Display full card data from prop, action buttons | Fetch data, perform actions (emits only) |

**Rule:** Card and overlay read **CardData from props only**. No API call or cache read inside the component; parent supplies the data (from cache). Aligns with cache strategy: hover = display cached data only.

---

## 2. Card grid layout

### 2.1 Responsive grid behavior

- **Layout:** CSS Grid (or Flexbox) with a fixed or responsive number of columns. Example: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` so columns grow/shrink with viewport; minimum card width (e.g. 200px) avoids tiny cards.
- **Gap:** Consistent gap between cards (e.g. 0.5rem–1rem). No gap between card and its overlay when overlay is positioned adjacent to or over the card.
- **Card size:** Each card cell has a consistent minimum size (e.g. min-height for summary). Thumbnail, if present, has a fixed aspect ratio (e.g. 1:1 or 4:3) to avoid layout shift.
- **Desktop-first:** Grid is tuned for mouse and keyboard; touch is out of scope for this design. Overlay position (e.g. to the right of or below the card) should not overflow the viewport; see §3.3.

### 2.2 Virtualization considerations

- **When:** If the number of cards exceeds a threshold (e.g. 50–100), use a virtual list so only visible items (plus a small overscan) are in the DOM. Reduces DOM nodes and re-renders when scrolling.
- **How:** A **VirtualCardList** (or equivalent) component: receives `cards: CardData[]`, item height (or estimated height), and container height; computes visible range; renders **Card** only for indices in that range. When the user scrolls, recompute range and re-render only the visible cards.
- **Key:** Each rendered **Card** must have a stable **key** (e.g. `card.id`) so Svelte can reconcile correctly when the list scrolls or data updates.
- **Overlay and virtualization:** When a card’s overlay is open (hover or focus), that card is in the visible set; when the user scrolls away, the overlay closes (blur or mouse leave). No need to “pin” overlay outside the virtual window; behavior stays simple.

**Rule:** Large lists use virtualization to limit DOM size; small lists render all cards. Threshold and item height are configurable.

---

## 3. Base Card component

### 3.1 Minimal always-visible fields (CardSummary)

- **Title:** `card.title` (required). Single line; truncate with ellipsis if too long (e.g. `max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`).
- **Thumbnail (optional):** If `card.imageUrl` is present, show a small image (e.g. 64×64 or card-width × fixed height). Use `alt` text from title for accessibility. Lazy-loading is optional (out of scope for styling; recommend native `loading="lazy"` if supported).
- **Subtitle (optional):** If `card.subtitle` is present, show one line below title; truncate with ellipsis.
- **No valuations, tags, or dates in summary.** Those appear in the overlay only. Keeps the card compact and consistent.

**Rule:** Summary is minimal and stable; same shape for every card regardless of type. No plugin-specific layout in the summary.

### 3.2 Click / hover / focus behavior

- **Hover:** When the pointer enters the card (card + overlay area), set “hovered” state. Show overlay. When the pointer leaves the card and overlay, set “not hovered” and hide overlay after a short delay (e.g. 0 ms) to avoid flicker if the user moves to the overlay. If the overlay is positioned over the card, pointer remains “inside” so hover stays active.
- **Focus:** The card (or a focusable wrapper) is in the tab order (`tabindex="0"`). When the card receives focus (Tab or click), set “focused” state and show overlay. When focus leaves the card and overlay (Tab or Shift+Tab), hide overlay. Focus can move into the overlay (e.g. action buttons) so the user can activate “Save to folder” or “Refresh” without mouse. See §5.
- **Click:** A single click on the summary may focus the card (and thus show overlay) or do nothing beyond focus. No implicit “open detail page” unless the product defines it; this design treats click as “focus and show overlay.” Double-click or explicit “Open” in overlay is out of scope.
- **No implicit side effects on hover:** Hover only changes local UI state (show overlay). No API call, no navigation, no analytics event. Overlay content is read from the `card` prop only.

**Rule:** Overlay visibility = (hovered OR focused). Idle = not hovered and not focused → overlay hidden.

---

## 4. Hover / focus overlay

### 4.1 When it appears and disappears

- **Appear:** When the user hovers over the card (pointer enter) or when the card (or its overlay) receives focus. Show overlay immediately (no delay) for responsiveness. Optionally a very short delay (e.g. 100 ms) on hover-only to avoid flash when moving across the grid; document the choice.
- **Disappear:** When the pointer leaves the card and overlay and focus is not inside the card/overlay, hide overlay. When focus leaves the card and overlay (e.g. Tab to next element), hide overlay. No “sticky” overlay that stays open after hover/focus leave; behavior is predictable.
- **One overlay at a time (optional):** If the product wants only one overlay open globally, the parent or a store can hold “active card id”; when a new card is hovered/focused, set active to that id and close others. This design does not require it; multiple overlays (e.g. one per hovered card) are allowed unless the product constrains it.

**Rule:** Overlay is visible iff (pointer is over card or overlay) OR (focus is inside card or overlay). No timers that keep overlay open after user has left.

### 4.2 What additional data is shown (OverlayContent)

- **Title:** Full title (no truncation in overlay).
- **Subtitle (optional):** Full subtitle.
- **Valuations:** For each key in `card.valuations`, show label (key) and value (e.g. value + unit + optional range/sources). Generic key-value list; no plugin-specific layout. Order by key name or manifest order if provided.
- **Tags (optional):** If `card.tags` is present, show as pills or comma-separated.
- **Updated (optional):** If `card.updatedAt` is present, show “Updated: &lt;date&gt;” (formatted for display).
- **Actions:** Buttons or links: “Save to folder,” “Delete,” “Refresh.” Buttons emit events (e.g. `onSaveToFolder(card.id)`); parent performs the action. See §4.4.
- **CustomFields (optional):** If the product shows customFields, render a generic key-value section; otherwise omit.

All data comes from the `card` prop (cached CardData). No fetch on show. If `card` is missing or incomplete, show “Not in cache” or the available fields only.

**Rule:** Overlay content is read-only display of CardData plus action buttons that emit; no side effects inside the overlay.

### 4.3 Overflow and long content

- **Overlay container:** Fixed max height (e.g. 80vh or 400px) and max width (e.g. 320px or 90vw). Position so it stays within viewport (e.g. prefer right/below the card; flip if would overflow).
- **Scroll:** If content (valuations, tags, etc.) exceeds max height, make the overlay body scrollable (`overflow-y: auto`). Header (title) and footer (actions) can be sticky so they stay visible while scrolling.
- **Long title/subtitle:** Wrap or truncate with ellipsis after N lines (e.g. 2–3 lines). Prefer wrap for overlay since space is larger than summary.
- **Long valuations list:** Scroll inside the overlay. No “show more” that triggers fetch; show what’s in the prop.

**Rule:** Overlay never overflows the viewport; overflow is handled by scroll or truncation inside the overlay.

### 4.4 Interactions available from the card (actions)

- **Save to folder:** Button “Save to folder” (or “Add to folder”). On click, emit event (e.g. `saveToFolder`) with `card.id` (or full `card`). Parent opens folder picker or adds to default folder; card component does not perform the action.
- **Delete card:** Button “Delete.” On click, emit event (e.g. `deleteCard`) with `card.id`. Parent confirms (if required) and removes from cache; card component does not perform the action.
- **Refresh card data:** Button “Refresh.” On click, emit event (e.g. `refreshCard`) with `card.id`. Parent triggers refresh for that card (per cache strategy); card component does not perform the action.

**Rule:** Card and overlay only emit events. Parent (or store/context) handles save, delete, refresh. Keeps components dumb and testable.

---

## 5. Keyboard and accessibility behavior

### 5.1 Focus handling

- **Card focusable:** The card wrapper (or the first focusable element inside it) has `tabindex="0"` so it can receive focus via Tab. Order: cards in grid order, then overlay content (if focus moves into overlay).
- **Focus in overlay:** When the overlay is visible (because the card has focus), focus can move into the overlay: e.g. Tab from card summary → first action button → next button → … → then Tab leaves overlay. So the user can reach “Save to folder,” “Delete,” “Refresh” without mouse. Use a single tab stop for the card when overlay is closed; when overlay is open, overlay content is in tab order.
- **Focus trap (optional):** When overlay is open and user tabs, optionally trap focus inside the card+overlay until Escape or explicit “Close”; this design does not require it. Simpler: allow Tab to leave overlay and close it (focus leaves → overlay closes).

**Rule:** Overlay content is keyboard-accessible; at least one way to open overlay (focus card) and one way to activate each action (focus button, Enter/Space).

### 5.2 Non-hover access to overlay content

- **Focus opens overlay:** When the user tabs to a card (or clicks to focus), the overlay opens. So keyboard-only and screen-reader users get the same content as hover users. No “hover only” information.
- **Overlay content semantics:** Use appropriate markup (e.g. `dl` for valuations, `ul` for tags, `button` for actions) so assistive tech can announce structure. Title and subtitle in overlay can be headings or aria-label as needed.
- **Live region (optional):** If overlay appears/disappears dynamically, optional `aria-live="polite"` for overlay container so screen readers announce “overlay open” or “overlay closed.” Not required for minimal a11y.

**Rule:** All overlay content is available via focus as well as hover. No hover-only content.

---

## 6. Performance considerations

### 6.1 Avoid unnecessary re-renders

- **Key by card.id:** Parent and CardGrid use `{#each cards as card (card.id)}` (or equivalent) so Svelte reconciles by id. When the list is updated (e.g. new search result), only changed cards re-render.
- **Card receives card prop only:** Card does not depend on the whole list or global state beyond what it needs (e.g. “active card id” if single-overlay). When `card` is unchanged (same reference or same id), Card can skip re-render if using derived state or reactive statements that depend only on `card`.
- **Overlay content:** Overlay re-renders when the card’s overlay is visible and `card` is passed in. No subscription to a global store inside Card unless necessary (e.g. single-overlay store). Prefer passing `card` from parent so parent controls when data updates.

**Rule:** Card is a pure function of `card` and local hover/focus state. Parent passes stable references where possible.

### 6.2 Interaction with cached data only

- **No fetch in Card or overlay:** Card and overlay never call API or Tauri. They only read `card: CardData` from props. Parent supplies data from cache (e.g. search result, group view, folder view). Aligns with cache strategy: hover = cache read only.
- **Cache miss:** If parent does not have the card (e.g. card id not in cache), parent can pass `null` or a minimal object (e.g. `{ id, title: "Not in cache" }`). Card and overlay render what they receive; no loading state or retry inside the component.

**Rule:** Card and overlay are pure display components; data comes from parent (cache). No side effects on mount, hover, or focus.

---

## 7. Interaction state model

### 7.1 States

| State | Condition | Overlay |
|-------|-----------|---------|
| **idle** | Pointer not over card/overlay and focus not inside card/overlay | Hidden |
| **hovered** | Pointer over card or overlay | Visible |
| **focused** | Focus is on card or inside overlay (e.g. button) | Visible |

Overlay is **visible** iff state is hovered OR focused. Overlay is **hidden** iff state is idle.

### 7.2 Transitions

- **idle → hovered:** Pointer enter card (or overlay). Show overlay.
- **hovered → idle:** Pointer leave card and overlay. Hide overlay.
- **idle → focused:** Card or overlay receives focus (Tab or click). Show overlay.
- **focused → idle:** Focus leaves card and overlay (Tab, Shift+Tab, or click outside). Hide overlay.
- **hovered → focused:** User tabs to card while pointer is over it. Stay visible (focused).
- **focused → hovered:** User moves pointer over card while it has focus. Stay visible (hovered).

**Rule:** State is local to each Card. No global “which card is hovered” unless the product explicitly wants single-overlay behavior.

---

## 8. Event flow descriptions

### 8.1 Hover flow

1. User moves pointer over a card.
2. Card detects pointer enter (e.g. `onmouseenter`), sets hovered = true.
3. Card shows overlay; overlay reads `card` from prop and renders content (no fetch).
4. User moves pointer to overlay (if overlay is adjacent) or stays on card; overlay stays visible.
5. User moves pointer out of card and overlay; Card detects `mouseleave`, sets hovered = false, hides overlay.

### 8.2 Focus flow

1. User tabs to a card (or clicks card to focus it).
2. Card (or wrapper) receives focus; sets focused = true.
3. Card shows overlay; overlay reads `card` from prop and renders content.
4. User tabs to “Save to folder” button inside overlay; focus moves into overlay; overlay stays visible.
5. User presses Enter on “Save to folder”; Card emits `saveToFolder` with card.id; parent handles (e.g. open folder picker).
6. User tabs out of overlay; focus leaves card+overlay; Card sets focused = false, hides overlay.

### 8.3 Action flow (e.g. Refresh)

1. User hovers or focuses card; overlay is visible.
2. User clicks “Refresh” (or focuses it and presses Enter).
3. Card emits `refreshCard` with card.id (or card).
4. Parent receives event; parent calls refresh logic (e.g. plugin.refresh for that card, then update cache); parent re-renders grid with updated cards.
5. Card receives updated `card` prop on next render; overlay shows new data. No logic inside Card beyond emit.

**Rule:** All actions are emit → parent handles. Card never calls API or cache directly.

---

## 9. Rationale

| Decision | Rationale |
|----------|------------|
| **Minimal summary (title, thumbnail, subtitle)** | Consistent, compact grid; rich detail on demand in overlay. Same shape for all card types. |
| **Overlay on hover OR focus** | Desktop-first; keyboard and a11y get same content as hover. No hover-only information. |
| **Overlay content from prop only** | Aligns with cache strategy: hover = cache read only. No implicit fetch; predictable. |
| **Emit actions, parent handles** | Card stays dumb and testable; parent owns save/delete/refresh and cache. |
| **Virtualization for large lists** | Keeps DOM small; avoids re-render of hundreds of cards. |
| **Key by card.id** | Stable reconciliation when list updates; fewer re-renders. |
| **No focus trap by default** | Simpler; Tab leaves overlay and closes it. Optional trap if product needs it. |
| **One overlay per card (or single global)** | Design allows multiple overlays; product can constrain to one via store. |
| **Overflow = scroll inside overlay** | Keeps overlay in viewport; no viewport scroll or clipping hacks. |

---

## 10. Summary

- **Hierarchy:** CardGrid → Card → CardSummary + CardOverlay → OverlayContent (title, subtitle, valuations, tags, actions).
- **Grid:** Responsive CSS grid; optional virtualization when N &gt; threshold; key by card.id.
- **Card:** Minimal visible (title, optional thumbnail, subtitle); overlay visible when hovered OR focused; no side effects on hover; data from prop only.
- **Overlay:** Appears on hover/focus; shows full CardData from prop; overflow by scroll; actions emit events (Save to folder, Delete, Refresh); parent handles actions.
- **State:** idle / hovered / focused; overlay visible iff hovered OR focused.
- **Keyboard/a11y:** Card focusable; focus opens overlay; overlay content and actions in tab order; no hover-only content.
- **Performance:** Key by id; no fetch in Card/overlay; data from parent (cache only).
