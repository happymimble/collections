# Dynamic Search Form Generation from Plugin Manifests (SvelteKit)

Design for the frontend system that generates search forms from plugin manifests in a SvelteKit application. The app is plugin-based and domain-agnostic; the frontend renders forms without hardcoded knowledge of object types. Users may fill any subset of fields; searches are explicitly submitted (no auto-search on change).

---

## 1. Plugin manifest shape required for form generation

The manifest shape is defined in **`src/lib/backend/plugins/types.ts`**. The frontend consumes **PluginManifest** and **SearchableField**; no separate frontend-only schema is required.

### 1.1 Manifest fields used by the form

| Manifest field | Purpose |
|----------------|---------|
| **id** | Plugin id; used for plugin selector and for SearchQuery.pluginIds. |
| **displayName** | Shown in plugin selector and form context. |
| **searchableFields** | Array of field descriptors; order = form field order. |

### 1.2 SearchableField shape (per field)

| Field | Purpose | Required |
|-------|---------|----------|
| **id** | Unique key; becomes SearchQuery.filters key (and, if convention used, the “query” field id). | Yes |
| **label** | Shown next to the form control. | Yes |
| **type** | Drives which input component is rendered (see §1.3). | Yes |
| **options** | For `select` / `multiselect`: `{ value: string; label?: string }[]`. | When type is select/multiselect |
| **placeholder** | Placeholder or hint text for the input. | No |
| **min** / **max** | For `number`: optional bounds (UI validation). | No |

All of these are explicit descriptors; no reflection or `eval`. The frontend iterates `searchableFields` and renders one control per entry.

### 1.3 Field type → control mapping

| type | Rendered control | Value type in state | Sent in SearchQuery |
|------|------------------|---------------------|----------------------|
| `text` | Single-line text input | string | query (if id is "query") or filters[id] |
| `number` | Number input (min/max if present) | number \| "" | filters[id] (omit if empty) |
| `date` | Date input (ISO date string) | string \| "" | filters[id] (omit if empty) |
| `select` | Single-choice dropdown | string \| "" | filters[id] (omit if empty) |
| `multiselect` | Multi-choice (e.g. checkboxes or multi-select) | string[] | filters[id] (omit if empty []) |
| `boolean` | Checkbox | boolean | filters[id] (omit if false, or always send) |

**Convention for free-text query:** If a field has `id === "query"` (or a single designated “query” field per plugin), its value is used as **SearchQuery.query**. All other field ids become keys in **SearchQuery.filters**. If no field has id `"query"`, the form may expose a single generic “Search” text input whose value is used as SearchQuery.query, or the first `text` field is used as query; the design chooses one convention and sticks to it (recommended: explicit `id: "query"` in manifest).

---

## 2. Svelte component structure

### 2.1 Hierarchy

```
SearchPage (or parent route)
  └── PluginSelector
  └── SearchForm (generated from selected plugin’s searchableFields)
        └── [SearchFormField] × N (one per searchableFields[i])
```

- **PluginSelector:** Dropdown or list of plugins. Data: list of **PluginDescriptor** or **PluginManifest** (id, displayName). Selection is a single plugin id (or “all”). When selection changes, the form is rebuilt from that plugin’s **searchableFields**; form state may be reset or preserved (recommended: reset to avoid stale values from another plugin).
- **SearchForm:** Receives `searchableFields: SearchableField[]` and optional `pluginId: string`. Renders a wrapper (e.g. `<form>`) and iterates `searchableFields`, rendering one **SearchFormField** per entry. Holds form state (see §3). Submit button triggers submission (no submit on change).
- **SearchFormField:** Receives `field: SearchableField` and `value` + `onChange` (or binding). Renders the appropriate control by `field.type` (text, number, date, select, multiselect, boolean). No business logic; purely presentational given descriptor + value.

### 2.2 Data flow

- **Input:** Parent has access to plugin list (from Tauri or store). User selects plugin → parent passes that plugin’s `searchableFields` (and optionally `pluginId`) to **SearchForm**.
- **SearchForm** maintains state for each field id (see §3). It passes each `SearchableField` and the current value (and updater) to **SearchFormField**.
- **Output:** On submit, SearchForm normalizes state into **SearchQuery** (see §4) and invokes a callback (e.g. `onSubmit(query: SearchQuery)`). Parent runs the search and updates UI; no API call inside the form components.

### 2.3 Extensibility

- Adding a new plugin only requires the plugin to declare **searchableFields** in its manifest. The same **SearchForm** and **SearchFormField** components render any list of SearchableField; no new component or branch per plugin or per field type beyond the fixed type → control map above. New field types (if ever added) require a single new branch in the field-type switch and a new mapping rule; no per-plugin code.

---

## 3. Form state management

### 3.1 How field values are stored

- **Structure:** One object keyed by field id: `Record<string, unknown>` where each key is `SearchableField.id` and each value is the type implied by `field.type` (string, number, boolean, or string[] for multiselect).
- **Initial state:** For each `searchableFields[i]`, set `state[field.id]` to the empty value for that type: `""` for text/number/date/select, `[]` for multiselect, `false` for boolean. Alternatively, leave missing keys as `undefined` and treat “missing” as empty.
- **Updates:** On user input, update only the corresponding key. Use a single reactive object (e.g. Svelte store or single `let formState` object) so the form stays in sync. **SearchFormField** receives `value` and calls `onChange(fieldId, value)` (or equivalent) so **SearchForm** can update state without knowing field semantics.

### 3.2 Empty vs populated fields

- **Empty:** For submission (see §4), omit empty values from **SearchQuery.filters**. Treat as empty: `""`, `undefined`, `[]` (for multiselect), and optionally `false` for boolean (so “unchecked” = omit). Do not send empty strings or empty arrays as filter values.
- **Populated:** Any non-empty value is included in filters (or, for the designated query field, in SearchQuery.query). No implicit default values; if the user leaves a field blank, it is omitted from the query.
- **Optional “Clear form”:** Reset all keys to initial empty values; no need to change component structure.

---

## 4. Submission behavior

### 4.1 Normalization of form data into SearchQuery

1. **Query string:** If a field with `id === "query"` exists, set `SearchQuery.query = String(state["query"] ?? "")`. Otherwise set `SearchQuery.query = ""` or use a single generic search input’s value.
2. **Filters:** For every other field id in state (or for every `searchableFields` entry whose id is not `"query"`), if the value is not empty (see §3.2), set `SearchQuery.filters[fieldId] = value`. Value type must match SearchQuery.filters: `string | number | boolean | string[]`. Multiselect → `string[]`; boolean → `boolean`; number → number (coerce from string if needed); text/date/select → `string`.
3. **Plugin scope:** Set `SearchQuery.pluginIds = [selectedPluginId]` when a single plugin is selected; omit when “all plugins” or no selection.
4. **Optional:** Set `limit`, `offset`, `sortBy`, `sortOrder` from UI or defaults; not required for minimal form.

**Output:** A single **SearchQuery** object passed to `onSubmit(query)`.

### 4.2 Validation rules (minimal, explicit)

- **Number fields:** If `field.min` or `field.max` is present and the value is a number, require `min <= value <= max`. If invalid, show an inline message and do not submit (or submit and let backend handle; recommend blocking submit for clarity).
- **Required fields:** By default, no field is required; user may submit with any subset. If a plugin or product requires a specific field (e.g. “query” must be non-empty), that is an explicit rule: e.g. “if field has `required: true` in manifest, block submit when empty.” Current manifest does not define `required`; add it only if needed.
- **Type coercion:** On submit, coerce input to the correct type (e.g. string "123" → number 123 for number field) so that SearchQuery.filters matches the expected types. Invalid input (e.g. non-numeric for number field) → treat as empty or show validation error and block submit.

Validation is explicit and driven by manifest metadata (min/max, optional required); no hidden rules.

---

## 5. Manifest-to-form mapping rules (summary)

| Manifest | Form behavior |
|----------|----------------|
| `searchableFields` array order | Field order in the form (render in index order). |
| `field.id` | Key in form state; key in SearchQuery.filters (or SearchQuery.query if id is "query"). |
| `field.label` | Label text next to the control. |
| `field.type` | Which input component to render (see §1.3). |
| `field.placeholder` | Placeholder/hint on the input. |
| `field.options` | Select/multiselect options (value + optional label). |
| `field.min` / `field.max` | Number input attributes and validation bounds. |

No other manifest fields are required for form generation. New plugins add new descriptors; the same components and mapping rules apply.

---

## 6. Example: manifest snippet → rendered form

**Manifest snippet:**

```json
{
  "id": "example",
  "displayName": "Example plugin",
  "searchableFields": [
    { "id": "query", "label": "Search text", "type": "text", "placeholder": "Enter search..." },
    { "id": "category", "label": "Category", "type": "select", "options": [
      { "value": "any", "label": "Any" },
      { "value": "a", "label": "Category A" },
      { "value": "b", "label": "Category B" }
    ]},
    { "id": "minValue", "label": "Min value", "type": "number", "min": 0, "placeholder": "0" }
  ]
}
```

**Rendered form (conceptual):**

1. **Plugin selector:** “Example plugin” selected.
2. **Form:**
   - Label “Search text” + text input (placeholder “Enter search…”). State key: `query`.
   - Label “Category” + dropdown with options Any / Category A / Category B. State key: `category`.
   - Label “Min value” + number input (min 0, placeholder “0”). State key: `minValue`.
   - Submit button: “Search” (or “Run search”).

**State flow (example):**

- User types `"Morgan"` in Search text, selects “Category A”, leaves Min value blank.
- State: `{ query: "Morgan", category: "a", minValue: "" }`.
- On submit: omit `minValue` (empty). Build SearchQuery: `{ query: "Morgan", filters: { category: "a" }, pluginIds: ["example"] }`. Call `onSubmit(query)`.

---

## 7. State flow description (input → query object)

1. **User selects plugin** → Parent passes `searchableFields` (and `pluginId`) to SearchForm. Form initializes state: one key per `field.id`, value = empty for that type.
2. **User edits fields** → Each change updates `state[field.id]`. No submit yet.
3. **User clicks Submit** → Form reads current state. Apply normalization:
   - Set `query` from state["query"] or generic search field.
   - Build `filters`: for each field id (except "query"), if value is not empty, add `filters[id] = normalizedValue` (coerce type if needed).
   - Set `pluginIds` from selected plugin (or omit).
4. **Form calls `onSubmit(SearchQuery)`** → Parent receives the query object and runs the search (e.g. calls backend/Tauri). Form does not perform the search itself.
5. **Optional:** On plugin change, reset form state to initial empty values so the new plugin’s fields are shown with empty values.

---

## 8. Extensibility rules

- **New plugin:** Add a plugin with a manifest that includes **searchableFields**. Ensure the plugin is registered and appears in the plugin list. The existing PluginSelector and SearchForm will show the new plugin and generate a form from its fields. No new Svelte components or form-specific code.
- **New field type:** If a new **SearchableFieldType** is added (e.g. `"range"`), add one branch in the SearchFormField type switch to render the control, and one row in the mapping table (§1.3) for value type and SearchQuery handling. All plugins can then use that type without further frontend changes.
- **New metadata (e.g. hint, required):** Extend SearchableField in the shared types (e.g. `hint?: string`, `required?: boolean`). In SearchFormField, read the new property and render accordingly (e.g. show hint below input, or block submit when required and empty). No per-plugin logic.

No `eval`, no reflection over plugin code; only the declarative manifest is used.

---

## 9. Rationale

| Decision | Rationale |
|----------|------------|
| **Single source of truth for manifest** | Backend types (SearchableField, PluginManifest) drive the form; no duplicate schema. Plugin authors have one place to add fields. |
| **Field order = array order** | Predictable, simple; plugin controls order via manifest. |
| **Explicit type → control map** | One place to maintain; adding a type is one new branch. No magic. |
| **Query field by id "query"** | Simple convention; one field carries the free-text query. Clear for plugin authors. |
| **Omit empty values from SearchQuery** | Keeps queries minimal and avoids “empty string” vs “omit” ambiguity. Backend receives only what the user filled. |
| **No auto-search on change** | User explicitly submits; no surprise network or re-runs. Matches “explicit search” requirement. |
| **Form state keyed by field id** | Straightforward mapping to SearchQuery.filters; no extra translation layer. |
| **Minimal validation (min/max, optional required)** | Keeps rules explicit and debuggable; no hidden validation. |
| **Plugin change resets form** | Avoids showing another plugin’s fields with stale values from the previous plugin. |
| **Submit callback, not search inside form** | Form stays dumb; parent owns search and API. Testable and clear separation. |

---

## 10. Summary

- **Manifest shape:** Use existing **PluginManifest** and **SearchableField** (id, label, type, options?, placeholder?, min?, max?). Order of **searchableFields** = form field order.
- **Components:** PluginSelector → plugin list + selection; SearchForm → state + iteration over searchableFields; SearchFormField → one control per type (text, number, date, select, multiselect, boolean). No hardcoded object types.
- **State:** One object `Record<fieldId, value>`; empty = "" | [] | false | undefined; omit empty from SearchQuery.
- **Submission:** Build SearchQuery (query from field id "query", filters from other fields, pluginIds from selection); optional min/max and required validation; call `onSubmit(query)`.
- **Extensibility:** New plugin = new manifest with searchableFields; new field type = one new branch in the type map. No frontend code change per plugin; explicit field descriptors only.
