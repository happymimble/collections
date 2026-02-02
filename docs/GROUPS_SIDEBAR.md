# Groups Sidebar & Filtering Logic

Design for the Groups sidebar and filtering logic in a SvelteKit-based, plugin-driven desktop application. Groups are logical, derived views over cached CardData; membership is computed, not stored. Groups coexist with free-form search queries and folders. Users can rename suggested groups and create their own groups.

---

## 1. Sidebar UI: layout and hierarchy

### 1.1 Layout

```
Sidebar
  ├── Groups (header)
  ├── Suggested Groups (section)
  │     └── GroupRow × N
  ├── User Groups (section)
  │     └── GroupRow × M
  └── Actions (footer)
        ├── + New Group
        └── Clear Filters
```

- **Suggested Groups section:** Groups with `source = "suggested"` and `suggestedByPluginId` set. These are plugin-provided defaults that the user has “added” (persisted definitions).
- **User Groups section:** Groups with `source = "user"`. Fully user-managed.
- **GroupRow:** Displays name, optional count (computed from current card set), and optional source indicator (e.g. plugin name for suggested groups).
- **Actions footer:** “New Group” opens create flow; “Clear Filters” clears active group selection (does not delete groups).

**Rule:** Suggested and user-defined groups are visually separated and labeled. This keeps “derived defaults” distinct from “user-created.”  

---

## 2. Group selection behavior

### 2.1 Single vs multiple active groups

- **Default:** **Single active group**. Selecting a group replaces the current selection.
  - Rationale: lower cognitive load; simple AND semantics with search query.
- **Optional (advanced):** **Multi-select** groups (e.g. with checkboxes). If enabled, multiple groups can be active simultaneously (see §3).

**Rule:** One selection mode per view; do not mix single-select and multi-select in the same UI without a clear toggle.

### 2.2 Toggling groups on/off

- **Single-select mode:**
  - Click on a group when none is selected → select it (active).
  - Click on the active group again → deselect (no active group).
  - Click on a different group → active group changes to the new one.
- **Multi-select mode:**
  - Each group has a toggle (checkbox). User can enable multiple groups.
  - “Clear Filters” turns all toggles off.

### 2.3 Clearing all filters

- **Clear Filters** button resets group selection to “none” and removes group filtering.
- This does **not** affect search query, folder view, or group definitions. It only clears active group filters.

**Rule:** Clearing filters is always explicit and reversible; it does not delete anything.

---

## 3. Filtering logic (Group filters + Search query)

### 3.1 Input and output

- **Input:** `CardData[]` from the current view (search results, group-filtered view, or folder view).
- **Active groups:** One or more group ids, where membership is computed from cached CardData (see `evaluateGroups` in `src/lib/backend/groups/evaluate.ts`).
- **Output:** Filtered CardData[] that satisfy group selection rules.

### 3.2 Combining groups with search queries

- **AND semantics:** Group filters always apply **after** the search query.
  - Search query produces a result set (CardData[]).
  - Group filter narrows that set to cards that belong to the active group(s).
- **Single active group:** Output = search results ∩ group members.
- **Multiple active groups (if enabled):**
  - Default: **AND** across groups (card must be in all selected groups).
  - Optional: **OR** across groups (card in any selected group). If OR is used, the UI must label it explicitly (e.g. “Match any selected groups” toggle).

**Rule:** Search query is always applied first; groups refine the result set. Group selection never triggers a search by itself.

---

## 4. Group lifecycle interactions

### 4.1 Renaming a group

- User can rename **user** groups and **suggested** groups.
- Renaming updates `GroupDefinition.name` only. It does not change `suggestedByPluginId` or `suggestedTemplateId`.
- If a plugin re-suggests a group with the same `suggestedTemplateId`, the user’s custom name remains the source of truth for display.

### 4.2 Creating a new group

- Trigger: “New Group” action in the sidebar.
- Flow: user enters name → define rules (out of scope for this prompt) → save as `source = "user"`.
- New group appears in the User Groups section and is immediately selectable.

### 4.3 Deleting a user-defined group

- Only **user** groups are deletable. Suggested groups are not deleted; they can be removed from the sidebar by “Unsave” or “Remove” if that concept exists (optional).
- Deleting a user group removes its definition; no effect on cards or cache.
- If the deleted group was active, it is cleared from active filters.

**Rule:** Deleting a group never deletes cards. It only removes the definition.

---

## 5. State management

### 5.1 Active group filter state

- **Single-select:** `activeGroupId: string | null`.
- **Multi-select:** `activeGroupIds: Set<string>` (or string[]).
- Stored in a Svelte store scoped to the view (e.g. `groupsFilterStore`).

### 5.2 Recalculation triggers

Recompute group membership or filter results when any of the following change:

1. **Card set changes** (new search results, folder view changes).
2. **Group definitions change** (rename, create, delete, update rules).
3. **Active group selection changes** (user toggles group(s)).

**Rule:** Filtering is deterministic: same cards + same group definitions + same active group selection → same output.

---

## 6. UX clarity rules

### 6.1 Distinguish “derived” vs “saved”

- **Suggested groups** show a source label (e.g. “From: Plugin X”) and use a consistent icon (e.g. spark/star) to indicate they are derived defaults.
- **User groups** show a “user” indicator or no icon at all; they appear in their own section.

### 6.2 Indicate filter state

- Active groups are highlighted and/or show a checkmark.
- The view header (or breadcrumb) shows active filters (e.g. “Group: High Value”).
- When filters are active, “Clear Filters” is enabled and visible.

**Rule:** The user can always answer “Which group filter is currently active?” at a glance.

---

## 7. Filtering flow (step-by-step)

1. User runs a search (explicit) → get `CardData[]` results.
2. User selects a group in the sidebar.
3. App computes membership for all groups (or only for the active group) using cached CardData and group definitions.
4. App filters the current result set to cards that are in the selected group.
5. Card grid displays the filtered list; overlay and actions work on these cards only.

**Rule:** Group selection does not call plugins or APIs; it only filters cached CardData.

---

## 8. Rationale

| Decision | Rationale |
|----------|-----------|
| **Separate suggested vs user sections** | Keeps plugin defaults distinct from user-created groups; reduces confusion. |
| **Single active group (default)** | Lower cognitive load; simple AND semantics with search. |
| **AND semantics with search** | Predictable: groups refine search results, never expand them beyond the query. |
| **Clear Filters action** | Explicit and reversible; no hidden state. |
| **Rename preserves suggestion linkage** | User customization stays, while the app can still track the original suggestion. |
| **No deletion of cards** | Groups are views; removing a group never affects card data. |
| **Store active filters in a Svelte store** | Idiomatic, reactive, and debuggable. |

---

## 9. Summary

- Sidebar has two sections: **Suggested Groups** and **User Groups**; actions at the footer.
- Default selection is **single active group**; optional multi-select if needed.
- Group filters apply **after** search results (AND semantics).
- Renaming changes only the group name; deleting user groups removes only the definition.
- Active group selection stored in a Svelte store; recompute on card set or group changes.
- Clear visual indicators show active filters and group provenance.
