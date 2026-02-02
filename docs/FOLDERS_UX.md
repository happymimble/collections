# Folder UX (Create, Add, Remove)

Design for folder user experience and interaction logic in the SvelteKit-based desktop application. Folders are **user-curated collections** of cards; membership is explicit and persisted. Folders store snapshot copies of CardData. Folder contents do **not** auto-update on refresh and are independent of groups and search filters.

---

## 1. Folder creation UX

### 1.1 How users create folders

- **Entry points:** “New Folder” button in the sidebar or in a folder picker dialog (e.g. from “Save to folder”).
- **Flow:** Click “New Folder” → modal or inline prompt → enter name → confirm.
- **Default state:** After creation, the new folder appears in the folder list; it can be selected immediately.

### 1.2 Naming rules and validation

- **Required:** Name is required (non-empty after trim).
- **Length:** Recommended max length (e.g. 60–80 chars) for UI; enforce in validation.
- **Uniqueness:** Names do **not** need to be globally unique; if duplicates exist, show a suffix in the UI (e.g. “Summer (2)”) but keep stored name as entered.
- **Invalid characters:** Avoid strict restrictions; allow any printable characters. Only trim leading/trailing whitespace.

**Rule:** Folder creation is explicit, simple, and does not auto-add any cards unless the user is in “Save to folder” flow.

---

## 2. Adding cards to folders

### 2.1 Entry points (from card actions)

- **Primary entry:** “Save to folder” action on each card (from card overlay).
- **Secondary entry:** Batch action on selected cards (if selection exists).
- **Picker:** Opens a folder picker with existing folders and “New Folder” option.

### 2.2 Handling duplicates

- **Default behavior:** If the card already exists in the target folder snapshot, do not add a duplicate. Show a small notice (e.g. “Already in folder”) or silently ignore.
- **Alternative (explicit):** Allow duplicates only if the product explicitly supports “duplicate entries,” which would be a different UX (not recommended here).

**Rule:** Folder membership is unique per card per folder snapshot; adding a card already present is a no-op.

---

## 3. Removing cards from folders

### 3.1 Folder-only removal semantics

- Removing a card from a folder **only removes it from that folder**. It does not delete the card from cache and does not affect other folders.
- Removal is scoped to the **current folder view**.

### 3.2 Confirmation behavior

- **Default:** No confirmation for single removal; allow quick undo (e.g. toast with “Undo”).
- **Bulk remove:** If removing multiple cards at once, optionally ask for confirmation (or provide a single undo for the batch).

**Rule:** Removing from a folder is reversible and does not delete data.

---

## 4. Folder navigation

### 4.1 Switching between folders and search/group views

- **Sidebar:** Folder list separate from Groups; selecting a folder switches the main view to the folder’s snapshot contents.
- **Back to search/group:** User can click “Search results,” “Groups,” or “All cards” (depending on app navigation) to exit folder view. Folder selection is cleared when switching away.

### 4.2 Empty folder states

- If a folder has zero cards, show an empty state message (e.g. “This folder is empty. Add cards from search results.”).
- Provide a single CTA: “Go to Search” or “Add cards” to guide the user.

**Rule:** Folder view is clearly distinct from search/group views; switching context is explicit.

---

## 5. Deletion behavior

### 5.1 Deleting a folder

- **Action:** “Delete folder” in folder context menu or toolbar.
- **Confirmation:** Required (destructive action). Confirm dialog: “Delete folder ‘X’? This removes the folder and its snapshot contents but does not delete cards from cache.”
- **Effect:** Folder definition and all its snapshots are removed. Cards remain in cache and in other folders.

### 5.2 Impact on cards and cached data

- Deleting a folder **never** deletes cards from cache. It only removes that folder’s stored snapshot(s).

**Rule:** Folder deletion is isolated to folder data; cards remain intact.

---

## 6. State management

### 6.1 Active folder selection

- Store the active folder id in a Svelte store: `activeFolderId: string | null`.
- When `activeFolderId` is set, the main view shows that folder’s snapshot contents; when null, show the current search/group view.

### 6.2 Folder content loading

- On folder selection, load the **latest snapshot** for that folder and display its stored CardData snapshot.
- No automatic refresh of folder contents when cache updates; folder contents remain as saved.
- If a card in a folder no longer exists in cache (e.g. deleted), show the snapshot copy stored with the folder. If the snapshot includes full CardData, it can be rendered directly without cache access.

**Rule:** Folder contents are static snapshots and do not auto-update.

---

## 7. Interaction flow descriptions

### 7.1 Create folder and add a card

1. User clicks “Save to folder” on a card.
2. Folder picker opens; user clicks “New Folder.”
3. User enters name and confirms.
4. New folder is created and the card is added to its snapshot.
5. Folder appears in the sidebar; optional: automatically switch to the folder view.

### 7.2 Add card to existing folder

1. User clicks “Save to folder” on a card.
2. Folder picker lists existing folders.
3. User selects a folder.
4. If the card is not already in the folder snapshot, it is added; otherwise no-op and a small notice can be shown.

### 7.3 Remove card from folder

1. User opens a folder view and selects a card.
2. User clicks “Remove from folder.”
3. Card is removed from the folder’s snapshot; card remains in cache and other folders.
4. Optional undo is shown.

### 7.4 Delete folder

1. User opens folder menu and clicks “Delete folder.”
2. Confirmation dialog appears.
3. On confirm, folder and its snapshots are removed.
4. Main view returns to search/group view; cards remain in cache.

---

## 8. UX clarity guidelines

- **Folder vs Group separation:** Sidebar clearly separates Folders and Groups. Folder view indicates it is a snapshot (“Saved items”) and not a live filter.
- **No auto-update:** Folder contents do not change when cards are refreshed elsewhere; avoid implying the folder is “live.”
- **Explicit actions:** Add, remove, delete are explicit buttons or menu items; no drag-and-drop required.
- **Undo where safe:** Offer undo for removes and adds when possible; deletion requires confirmation.

---

## 9. Rationale

| Decision | Rationale |
|----------|-----------|
| **Explicit creation and add flows** | Reduces accidental changes; user knows when cards are saved. |
| **No duplicates in folder** | Predictable; avoids confusion and clutter. |
| **Remove only from folder** | Keeps folder changes safe and reversible; no data loss. |
| **Deletion requires confirmation** | Destructive action; prevents accidental loss of curated set. |
| **Active folder in a store** | Idiomatic Svelte; clear source of truth for current view. |
| **Snapshot contents don’t auto-update** | Matches requirement: folder contents are independent of cache refresh. |
| **No drag-and-drop requirement** | Keeps UX simple and accessible; works with keyboard. |

---

## 10. Summary

- **Create:** Explicit “New Folder” flow with name validation; no automatic card add unless in “Save to folder” flow.
- **Add:** From card actions via folder picker; duplicates are ignored.
- **Remove:** Folder-only removal; optional undo; no effect on cache.
- **Navigate:** Sidebar switches between folder view and search/group views; empty state has clear CTA.
- **Delete:** Confirmed destructive action; removes folder and snapshots only.
- **State:** `activeFolderId` store; load latest snapshot when selected; folder contents remain static until user updates them.
