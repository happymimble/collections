# Plugin System

Self-contained plugins for search and enrichment. No core application code changes are required to load new plugins.

---

## 1. Plugin interface (TypeScript)

Every plugin entry module must **default-export** an object that satisfies `Plugin`:

| Member | Required | Description |
|--------|----------|-------------|
| `manifest` | Yes | `PluginManifest`: id, displayName, version?, searchableFields |
| `search` | Yes | `(query: SearchQuery) => Promise<{ items: unknown[]; total?: number }>` |
| `autocomplete` | Yes | `(partialQuery: string, context?) => Promise<AutocompleteSuggestion[]>` |
| `normalize` | Yes | `(rawItem: unknown) => CardData` (sync, pure) |
| `enrich` | No | `(card: CardData) => Promise<CardData>` (optional valuation logic) |
| `suggestedGroups` | No | `Group[]` or `() => Group[]` (suggested group definitions) |
| `evaluateGroup` | No | `(card: CardData, group: Group) => boolean` (custom group membership) |

Types are in `src/lib/backend/plugins/types.ts`.

---

## 2. Manifest schema

The manifest declares **plugin id**, **display name**, and **searchable fields** (with field types). The UI builds search forms entirely from this; no plugin-specific form code.

**plugin.json** (or inline in the plugin entry):

```json
{
  "id": "example",
  "displayName": "Example plugin",
  "version": "1.0.0",
  "searchableFields": [
    {
      "id": "query",
      "label": "Search text",
      "type": "text",
      "placeholder": "Enter search..."
    },
    {
      "id": "category",
      "label": "Category",
      "type": "select",
      "options": [
        { "value": "any", "label": "Any" },
        { "value": "a", "label": "Category A" }
      ]
    },
    {
      "id": "minValue",
      "label": "Min value",
      "type": "number",
      "min": 0,
      "max": 100
    }
  ]
}
```

**Field types** (for form generation):

| type | UI control | Notes |
|------|------------|--------|
| `text` | Text input | Free text |
| `number` | Number input | Optional min/max |
| `date` | Date input | ISO date string |
| `select` | Dropdown | options: `{ value, label? }[]` |
| `multiselect` | Multi-select | options: `{ value, label? }[]` |
| `boolean` | Checkbox | true/false |

Filter keys in `SearchQuery.filters` use the field `id` (optionally prefixed with plugin id when merging multiple plugins).

---

## 3. Example plugin skeleton

Location: **plugins/example/**.

- **plugin.json** – Manifest (id, displayName, searchableFields). Read by Tauri at discovery.
- **index.ts** – Entry module: exports a default `Plugin` object (manifest + search, autocomplete, normalize, optional enrich, suggestedGroups, evaluateGroup).

The example uses stub implementations; replace with real data or API calls. When developed in-repo, imports from `../../src/lib/backend` resolve via the app build; for plugins loaded from a user directory, bundle the plugin with the app types or a shared types package so the entry is self-contained. Raw items are plugin-specific; `normalize()` turns each into `CardData` for the core.

---

## 4. Discovery and loading strategy

### Discovery (host / Tauri)

- **Who:** Rust (Tauri). Core application code is not modified.
- **Where:** Plugin root directory (e.g. `plugins/` in repo, or `%APPDATA%/collections/plugins` for user plugins).
- **How:** For each subfolder, read `plugin.json`, parse manifest. Build a list of **PluginDescriptor** (id, displayName, version, searchableFields, entryUrl, enabled?).
- **entryUrl:** Must be a URL the WebView can use for `import(entryUrl)` (e.g. Tauri asset URL or served path). Tauri resolves the plugin folder path and exposes the entry (e.g. `index.js` or bundled entry) at that URL.
- **IPC:** Expose `list_plugins` command returning `PluginDescriptor[]`. Optionally `get_plugin_entry_url(pluginId)` if URL is computed per request.

### Loading (WebView)

- **Who:** Frontend or a thin bridge (e.g. in SvelteKit). Backend receives descriptors and loads plugins; it does not call Tauri directly.
- **Flow:**
  1. Call Tauri `list_plugins` → get `PluginDescriptor[]`.
  2. Call `loadPlugins(descriptors)` (from `src/lib/backend/plugins/loader.ts`).
  3. For each descriptor with `entryUrl` and `enabled !== false`, `import(entryUrl)`.
  4. Validate default export: must have `manifest`, `search`, `autocomplete`, `normalize` (see `isPlugin()` in loader).
  5. Return `Map<string, Plugin>` keyed by plugin id.
- **Form generation:** Before or after load, use `descriptors[].searchableFields` (or `mergeSearchableFields(descriptors)`) to build the search form. No need to load the plugin module only for form generation; manifest is in the descriptor.

### Summary

| Step | Where | What |
|------|--------|------|
| Scan plugin dirs | Rust | List folders, read plugin.json per folder |
| Build descriptors | Rust | id, displayName, searchableFields, entryUrl |
| Expose list | Rust → WebView | list_plugins → PluginDescriptor[] |
| Load modules | WebView | loadPlugins(descriptors) → dynamic import(entryUrl) |
| Validate | WebView | isPlugin(export) → Map<id, Plugin> |
| Build search form | WebView | From descriptors[].searchableFields or mergeSearchableFields() |

Plugins run **locally** in the WebView; no remote server. All plugin logic (search, autocomplete, normalize, enrich, group suggestions/evaluators) runs in the same process as the app.
