# Windows Executable Packaging

Design for Windows packaging and distribution of the Tauri-based desktop application. The app is built with SvelteKit + Tauri and distributed to Windows users as a standalone executable. The goal is a simple, predictable distribution model.

---

## 1. Build outputs

### 1.1 Executable format

- **Output:** A Windows `.exe` produced by Tauri (e.g. `collections.exe`).  
- **Architecture:** x64 by default. (If ARM64 is needed later, treat as a separate build.)

### 1.2 Associated assets

- **Bundled assets:** All frontend assets (SvelteKit build) are bundled into the Tauri app package.  
- **Runtime assets:** Any runtime resources (icons, default config) are packaged alongside the executable as part of the Tauri bundle.

**Rule:** The distribution is a single, self-contained application bundle; no external dependencies are required to run.

---

## 2. Packaging behavior

### 2.1 Installer vs portable

- **Default:** **Portable executable** (no installer).  
  - Rationale: simplest distribution, no background services, minimal user friction.  
  - User downloads and runs `collections.exe` directly.
- **Optional (later):** MSI installer can be added for enterprise or managed environments, but is not required for initial distribution.

### 2.2 Default install location

- **Portable:** User chooses location (e.g. `C:\Apps\Collections\collections.exe`).  
- **If installer is used:** Default install directory `C:\Program Files\Collections\` (standard Windows convention).

**Rule:** Packaging defaults to portable `.exe` for simplicity; installer is optional.

---

## 3. Data location expectations

### 3.1 SQLite database location

- **Default location:** `%LOCALAPPDATA%\\Collections\\data\\` (e.g. `C:\Users\<User>\AppData\Local\Collections\data\`).
- **Rationale:** User-writable, predictable, and independent from executable location (which may be read-only under Program Files).

### 3.2 Relationship to executable directory

- **Executable directory:** Holds the app binary and bundled assets; not used for database storage by default.
- **Export files:** Per `FILESYSTEM_TAURI.md`, exports are written to the **executable directory** (or `exports/` subfolder) to meet the explicit requirement. This is distinct from the DB location.

**Rule:** App data (SQLite) lives in AppData; exports may be written to the executable directory as an explicit user action.

---

## 4. Update assumptions

- **Manual updates:** Users download a new version and replace the executable (or reinstall if using MSI).  
- **No auto-updater:** The app does not include background services or auto-update mechanisms.

**Rule:** Updates are user-initiated and explicit; no background update checks.

---

## 5. Signing considerations

### 5.1 Code signing expectations

- **Recommended:** Sign the executable with a trusted code-signing certificate to reduce SmartScreen warnings.
- **If unsigned:** Windows may show “Unknown publisher” warnings; users must explicitly allow execution.

### 5.2 User trust warnings

- Provide clear documentation: “If Windows warns about an unknown publisher, verify you downloaded from the official source.”
- Signing is a distribution concern; the app should run without requiring elevated privileges.

**Rule:** Signing is strongly recommended but not required for functional correctness.

---

## 6. Packaging flow (conceptual)

1. Build frontend assets (SvelteKit build).  
2. Tauri bundles assets and produces Windows `.exe`.  
3. Distribute the `.exe` directly (portable) or package into MSI (optional).  
4. User runs executable; app creates/uses `%LOCALAPPDATA%\\Collections\\data\\` for SQLite.  
5. Exports (user-initiated) are written to the executable directory (or `exports/` subfolder).

---

## 7. File layout overview (portable)

```
C:\\Apps\\Collections\\
  collections.exe
  exports\\                (optional export target)

%LOCALAPPDATA%\\Collections\\
  data\\
    app.db                 (SQLite database)
  logs\\                   (optional, if logging is added)
```

---

## 8. User-facing expectations

- The app runs as a single executable (no installer required).  
- User data (SQLite) lives in AppData; deleting the executable does not remove user data.  
- Exported files are written next to the executable (or in `exports/`).  
- Updates require replacing the executable manually.

---

## 9. Rationale

| Decision | Rationale |
|----------|-----------|
| **Portable .exe default** | Easiest distribution; no installer or background service. |
| **SQLite in AppData** | Writable and predictable; avoids Program Files write restrictions. |
| **Manual updates** | Matches “no auto-updater” requirement; keeps behavior explicit. |
| **Code signing recommended** | Reduces SmartScreen warnings; increases user trust. |
| **Exports in executable dir** | Satisfies explicit filesystem requirement; user-initiated and controlled. |

---

## 10. Summary

- Build produces a **Windows `.exe`** with bundled assets.  
- Default distribution is **portable**; MSI installer is optional later.  
- SQLite lives in **%LOCALAPPDATA%\\Collections\\data\\**.  
- Export files are written to the executable directory (or `exports/` subfolder) on explicit user action.  
- Updates are manual; no auto-updater or background services.  
- Code signing is recommended to reduce trust warnings.
