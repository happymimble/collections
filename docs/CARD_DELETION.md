# Card Deletion Semantics (Cache vs Folder)

Design for card deletion semantics in a local-first, plugin-based desktop application. Cards originate from external APIs and are normalized into CardData. Cached CardData is the latest state. Folders store snapshot copies. Groups are derived views. No soft deletes or trash bin; actions must be explicit and intentional.

---

## 1. User-facing mental model

- **“Delete from search results” = remove from cache.** The card is removed from local cache; it may reappear if the user searches/refreshes again (since the external source still exists).
- **“Remove from folder” = remove only from that folder’s snapshot.** The cached card remains; other folders are unchanged.
- **Groups are views.** Deleting from cache removes the card from all group views automatically because groups are derived.

This keeps deletion predictable: cache deletion removes the local copy; folder removal only affects that folder.

---

## 2. Explicit deletion rules (bullet list)

### 2.1 Deleting from search results (cache)

- **Action:** “Delete card” in search results or card overlay while in search/group view.
- **Effect:** Remove the card from the **cache** entirely (delete by card id).
- **After deletion:**
  - The card disappears from the current results and from all group views derived from cache.
  - The card remains in any folder snapshots only if the folder stores full CardData snapshots (see §3.2). Those snapshots are independent and not auto-removed.
  - The card may reappear in future searches or refreshes because the external API still exists and the cache will be repopulated on explicit refresh/search.
- **Rule:** Delete from search results = delete from cache only. No other data is modified.

### 2.2 Deleting from a folder

- **Action:** “Remove from folder” within a folder view or folder context menu.
- **Effect:** Remove the card **only from that folder’s snapshot**.
- **After deletion:**
  - The card remains in cache.
  - The card remains in other folders.
  - The card remains visible in search and group views (unless separately deleted from cache).
- **Rule:** Folder removal never deletes the cached card.

---

## 3. Cache deletion behavior

- **Cache removal:** Deleting a card from cache deletes the local CardData row for that card id (no soft delete).
- **Future searches:** If the user searches/refreshes again and the external API still returns that object, it will be re-cached and reappear. Deletion is not a permanent block; it is a local removal.
- **Refresh impact:** A refresh on a scope that includes the deleted card can bring it back. This is consistent with “cache is the latest refreshed state.”

**Rule:** Cache deletion removes the local copy only; it does not block future reappearance from refresh/search.

---

## 4. Folder deletion behavior

### 4.1 Removing from folder

- Removes the card only from the selected folder snapshot.
- No impact on cache or other folders.

### 4.2 Snapshot persistence

- If the folder stores full CardData snapshots, those snapshots remain intact in other folders even if the cached card is deleted later.
- If the folder stores only card ids (not full CardData), and the card is deleted from cache, the folder view may show “not in cache” or a minimal placeholder for that entry (product choice). This design assumes folders store full snapshots, so they remain viewable without cache.

**Rule:** Folder snapshots are independent; deleting from cache does not delete folder snapshots.

---

## 5. Confirmation rules

### 5.1 When confirmation is required

- **Required:** Deleting from cache (search results or group view) must show a confirmation dialog. This is destructive (no trash bin).
- **Optional:** Removing from a folder can be immediate with undo (preferred) or confirmed (optional for bulk actions).

### 5.2 Communication of destructive actions

Confirmation dialog must state:

- “This removes the card from local cache.”
- “It may reappear if you refresh or search again.”
- “Folders may still contain snapshot copies.” (if applicable)

**Rule:** Destructive actions are explicit, confirmed, and clearly explained.

---

## 6. UI state updates

- **Immediate feedback:** On confirm, remove the card from the current list immediately (optimistic UI). If deletion fails, restore it (error handling out of scope).
- **Derived views (groups):** Because groups are computed from cache, deleting from cache automatically removes the card from all group views. Group counts update accordingly.
- **Folder views:** Deleting from a folder immediately removes it from that folder list; other folders unaffected.

**Rule:** UI reflects the chosen deletion scope immediately and consistently.

---

## 7. Edge cases

### 7.1 Card exists in multiple folders

- **Delete from cache:** Card disappears from search/group views; **folder snapshots remain** (if snapshots store full CardData).
- **Remove from one folder:** Only that folder changes; other folders remain unchanged.

### 7.2 Deleting while filtered by groups

- **From group view:** Deleting from cache removes the card from the group view and any other group. The group filter remains active; only the card is removed.
- **From search results with group filter applied:** Same as above (AND semantics). Group selection remains; card removed from current filtered list.

### 7.3 Deleting after refresh

- **Delete after refresh:** Card is removed from cache immediately after refresh; future refresh/search can reintroduce it if it is still returned by the API. This is expected.

**Rule:** Deletion is local and reversible only by future explicit refresh/search; no hidden recovery.

---

## 8. Rationale

| Decision | Rationale |
|----------|-----------|
| **Cache delete requires confirmation** | No soft delete; destructive action must be explicit. |
| **Folder removal is non-destructive** | Folders are curated lists; removing is safe and reversible (undo). |
| **Groups are derived** | Removing from cache automatically updates all group views; no extra logic needed. |
| **No permanent block** | Cache reflects latest refresh; deletion is a local removal, not a global blacklist. |
| **Immediate UI updates** | Predictable; user sees the effect right away. |

---

## 9. Summary

- **Delete from search/group view** → removes card from **cache** (confirmed). Card may reappear on future refresh/search.
- **Remove from folder** → removes card from **that folder only** (no cache impact).
- **Groups update automatically** because they are derived from cache.
- **Confirmation required** for cache deletion; folder removal can be undo-based.
- **No soft deletes** or background recovery; actions are explicit and intentional.
