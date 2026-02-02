# JSON Export Format & Export Button Behavior

Design for the JSON export feature in the local-first, plugin-based desktop application. Users curate cards into folders; folder items are immutable snapshot copies of CardData. Export is user-initiated, explicit, deterministic, and does not mutate app state.

---

## 1. What is exported

### 1.1 Included folders

- **Default:** Export **all user folders** and their snapshot contents.
- **Optional scope:** If the user triggers export while viewing a specific folder, allow “Export this folder only” as a secondary option.

### 1.2 Excluded data

- **Uncategorized / cached-only cards:** Excluded by default. Export is based on **folder snapshots only**; cached cards not saved to folders are not exported.
- **Groups:** Not exported (derived views only).
- **Search history:** Not exported.

**Rule:** Export is folder-based. Only cards present in folder snapshots are included.

---

## 2. JSON structure

### 2.1 Top-level schema

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-02-01T12:34:56.000Z",
  "app": {
    "name": "collections",
    "version": "0.1.0"
  },
  "plugins": [
    { "id": "example", "version": "1.0.0" }
  ],
  "folders": [
    {
      "id": "folder-1",
      "name": "My Favorites",
      "description": "High-interest items",
      "createdAt": "2025-12-01T10:00:00.000Z",
      "updatedAt": "2025-12-15T09:00:00.000Z",
      "snapshot": {
        "id": "snapshot-1",
        "createdAt": "2025-12-15T09:00:00.000Z",
        "cards": [
          { "card": { /* CardData snapshot */ }, "position": 0 },
          { "card": { /* CardData snapshot */ }, "position": 1 }
        ]
      }
    }
  ]
}
```

### 2.2 Folder representation

Each folder includes:

- **id, name, description, createdAt, updatedAt**: metadata for the folder.
- **snapshot**: the latest snapshot at export time (see below).

### 2.3 Card snapshot representation

Each snapshot contains an ordered array of entries:

```json
{
  "card": { /* CardData */ },
  "position": 0
}
```

- **card:** Full CardData snapshot as saved in the folder.
- **position:** Optional, preserves ordering within the folder snapshot.

### 2.4 Metadata fields

- **schemaVersion:** Export schema version (integer). Enables forward compatibility.
- **exportedAt:** ISO timestamp of export.
- **app:** Name and version of the application.
- **plugins:** List of plugin ids and versions referenced in exported cards (optional but recommended for context and audit).

**Rule:** Exported JSON is complete, human-readable, and deterministic (stable key ordering, consistent timestamps).

---

## 3. Export flow description

1. User clicks **Export** (global or folder-level).
2. App determines export scope:
   - Default: all folders.
   - Optional: current folder only (if user chooses).
3. App constructs export JSON from **folder snapshots** only (no cache-only cards).
4. App writes the JSON file (filesystem handling out of scope).
5. App shows success or failure feedback (see §5).

**Rule:** Export does not mutate app state (no edits to folders, cache, or history).

---

## 4. Export button behavior

### 4.1 Button placement

- **Global export:** In a top-level menu or toolbar (e.g. “File → Export” or a toolbar button).
- **Folder export:** In folder view actions (e.g. “Export folder” next to folder name).

### 4.2 Single-click vs confirmation

- **Default:** Single click opens save dialog and proceeds. No confirmation dialog needed because export is non-destructive.
- **Optional:** If the app supports overwriting existing files (see §4.3), the save dialog may prompt for overwrite.

### 4.3 Overwrite rules

- If the chosen export path already exists, the app should **prompt the user** (standard save dialog behavior).
- **Rule:** Never overwrite silently. Overwrite requires explicit user confirmation in the save dialog.

---

## 5. Success and failure feedback

### 5.1 Success feedback

- Show a non-intrusive success message: “Export completed” with the file path (or a link to reveal in file explorer).
- No UI state changes beyond the message (export is read-only).

### 5.2 Failure feedback

- Show a clear error message with a short reason (e.g. “Export failed: write permission denied”).
- Offer a “Try again” action.
- Do not change or delete any data on failure.

**Rule:** Export failures are non-destructive and recoverable.

---

## 6. UX behavior rules

- Export is explicit and user-initiated.
- Export includes **folder snapshots only** (no cache-only cards).
- Export does not modify app state.
- Overwrites require explicit confirmation.
- Success is acknowledged; failure is actionable.

---

## 7. Rationale

| Decision | Rationale |
|----------|-----------|
| **Folder-based export** | Matches user intent: curated, saved cards. Avoids exporting transient cache. |
| **Single JSON file** | Portable, human-readable, easy to share and back up. |
| **Schema version** | Allows future evolution without breaking existing exports. |
| **Snapshot card data** | Preserves what the user saved, independent of current cache. |
| **No silent overwrite** | Prevents accidental data loss. |
| **No state mutation** | Export is read-only; maintains trust. |

---

## 8. Summary

- Export includes **folder snapshots only**; cache-only cards are excluded.
- JSON is deterministic, human-readable, and versioned.
- Export is explicit, non-destructive, and does not mutate state.
- Overwrites require confirmation in the save dialog.
- Success and failure feedback are clear and actionable.
