# Filesystem Access via Tauri

Design for the filesystem access layer in the Tauri-based desktop application. The app can export data to the local filesystem and must write files to the directory containing the executable. Access is restricted and user-initiated.

---

## 1. Filesystem capabilities required

### 1.1 Write JSON files

- **Capability:** Write a UTF-8 JSON file to a target directory.
- **Format:** JSON content is produced by the app (export logic out of scope); filesystem layer only receives bytes.
- **Naming:** Default filename can be `export-YYYYMMDD-HHMMSS.json` (or user-specified).

### 1.2 Handling existing files

- **Default:** Do not overwrite silently. If a file exists, return an error (e.g. `AlreadyExists`) and let the UI prompt the user.
- **Optional:** Provide an explicit `overwrite: boolean` flag in the IPC call; only overwrite when this flag is true and user confirmed.

**Rule:** No silent overwrites.

---

## 2. Security model

### 2.1 Tauri permissions (principle of least privilege)

- **Allow file write** only to the **executable directory** (or a subdirectory within it, e.g. `exports/`).
- **Disallow** arbitrary paths and user home directories unless explicitly allowed by configuration.

### 2.2 Restricted filesystem scope

- **Root:** The directory containing the executable (e.g. `C:\Program Files\Collections\`), or a dedicated subfolder (e.g. `C:\Program Files\Collections\exports\`).  
- **Validation:** Backend rejects any path that resolves outside the allowed root.  
- **Path normalization:** Resolve `..` and normalize separators before checking scope.

**Rule:** Backend enforces scope; frontend never writes arbitrary paths.

---

## 3. IPC boundary (frontend → backend)

### 3.1 IPC command (conceptual)

**Command:** `export_write_json`  
**Input:** `{ filename: string, contents: string, overwrite?: boolean }`  
**Output:** `{ ok: true, path: string }` or `{ ok: false, error: { code, message } }`

### 3.2 Flow

1. Frontend builds JSON string and a filename (or prompts user for filename).  
2. Frontend calls the Tauri command with `filename`, `contents`, `overwrite` (if user confirmed overwrite).  
3. Backend validates the path (executable directory scope).  
4. Backend writes the file.  
5. Backend returns success (path) or error (code + message).  
6. Frontend shows success or error (no silent failures).

**Rule:** All filesystem writes go through a single, explicit IPC command.

### 3.3 Error propagation

Backend returns structured errors:

- `PermissionDenied`
- `AlreadyExists`
- `DiskFull`
- `InvalidPath`
- `WriteFailed`

Frontend rules:

- Show the error message inline and allow the user to retry.
- Do not claim success unless `ok: true`.

---

## 4. Platform considerations (Windows)

### 4.1 Executable-relative directories

- Use Tauri’s API (conceptually) to resolve the executable directory (e.g. `app_dir` or equivalent) and then a fixed subfolder (e.g. `exports/`).
- Ensure the target directory exists; if not, create it (within allowed scope only).

### 4.2 Windows path handling

- Use canonical absolute paths (e.g. `C:\Program Files\Collections\exports\file.json`).
- Normalize `\` separators and reject paths containing `..` after normalization.

**Rule:** All paths are absolute and within the executable directory (or its `exports/` subfolder).

---

## 5. Failure cases and handling

### 5.1 Permission denied

- Return `PermissionDenied`.  
- Frontend shows “Permission denied — choose another filename or run with appropriate permissions.”

### 5.2 Disk full

- Return `DiskFull`.  
- Frontend shows “Disk full — free space and retry.”

### 5.3 Invalid path

- Return `InvalidPath` if the filename is empty, contains invalid characters, or resolves outside the allowed root.  
- Frontend shows “Invalid filename or location.”

### 5.4 File exists

- Return `AlreadyExists` if the file exists and overwrite flag is false.  
- Frontend prompts for overwrite confirmation and retries with `overwrite: true` if the user accepts.

**Rule:** All failures are explicit; no silent fallbacks.

---

## 6. Filesystem access flow (summary)

1. User clicks Export (explicit action).  
2. Frontend builds JSON and filename.  
3. Frontend calls `export_write_json` (IPC).  
4. Backend validates scope, writes file, returns success or error.  
5. Frontend shows success or error (no silent failures).

---

## 7. Rationale

| Decision | Rationale |
|----------|-----------|
| **Executable-directory scope only** | Minimizes permissions and prevents arbitrary file writes. |
| **Single IPC command** | Centralized validation and auditing; simple frontend contract. |
| **No silent overwrites** | Prevents accidental data loss. |
| **Structured errors** | Clear, actionable messages for users. |
| **Explicit user action** | Matches “export is user-initiated” requirement. |

---

## 8. Summary

- Filesystem writes are limited to the executable directory (or a fixed subfolder).  
- Frontend uses a single IPC command to write JSON; backend validates scope.  
- Overwrite requires explicit user confirmation.  
- Errors are structured and surfaced to the user; no silent failures.  
- Windows path normalization and scope checks prevent traversal.

