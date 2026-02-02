# Logical Groups: Design

Groups are **logical, derived views** over CardData. They are not folders. Membership is **always computed** from cached CardData; only **definitions** are persisted.

---

## 1. TypeScript interfaces

### GroupRule (equality, range, contains, computed)

Rules are either **declarative** (field/operator/value, evaluated by the core) or **computed** (evaluated by a plugin).

**Declarative rule** – core evaluates against CardData using dot-path fields:

```ts
interface DeclarativeGroupRule {
  kind: "declarative";
  id: string;
  field: string;        // e.g. "title", "valuations.price.value"
  operator: GroupRuleOperator;
  value?: unknown;     // omit for "exists"
}

type GroupRuleOperator =
  | "eq" | "neq" | "in"   // equality
  | "gt" | "gte" | "lt" | "lte"  // range
  | "contains"           // string/array contains
  | "exists";            // field present
```

**Computed rule** – plugin provides membership for this rule:

```ts
interface ComputedGroupRule {
  kind: "computed";
  id: string;
  pluginId: string;    // plugin that implements evaluateGroup(card, group)
}

type GroupRule = DeclarativeGroupRule | ComputedGroupRule;
```

### GroupDefinition (persisted)

```ts
interface GroupDefinition {
  id: string;
  name: string;
  description?: string;
  source: "user" | "suggested";
  suggestedByPluginId?: string;   // when source === "suggested"
  suggestedTemplateId?: string;  // plugin's suggestion id (for re-suggest / rename)
  rules: GroupRule[];
  ruleLogic: "and" | "or";
  createdAt: string;
  updatedAt?: string;
}
```

- **user**: created by the user; name and rules fully editable.
- **suggested**: from a plugin; user may add and rename; `suggestedTemplateId` links to the plugin’s suggestion so the app can show “from Plugin X” or refresh suggestions.

---

## 2. How plugins declare suggested groups and computed evaluators

### Suggested groups

Plugins export **suggestedGroups**: `Group[]` or `() => Group[]`. Each item is an in-memory **Group** (id, name, description, rules, ruleLogic, createdAt, updatedAt). Rules use **DeclarativeGroupRule** and/or **ComputedGroupRule**.

- **High-quality defaults**: suggestions should be domain-sensible (e.g. “High value”, “Needs grade”, “By year”). The core app is domain-agnostic; plugins own the domain.
- **Stable ids**: use a stable id (e.g. `pluginId:template-id`) so the app can match user-added suggestions via `suggestedTemplateId`.

When the user “adds” a suggestion, the app persists a **GroupDefinition** with:

- `source: "suggested"`
- `suggestedByPluginId: pluginId`
- `suggestedTemplateId: group.id` (the plugin’s id for this suggestion)
- `name`: plugin’s name (user can rename later)
- `rules`, `ruleLogic`: copied from the suggestion

### Computed group evaluators

Plugins optionally export **evaluateGroup**: `(card: CardData, group: Group) => boolean`.

- Used when a **GroupRule** has `kind: "computed"` and `pluginId` equals this plugin. The core calls `evaluateGroup(card, definition)` for that rule; the plugin returns whether the card belongs (e.g. complex grading, external lookup).
- Core only calls the evaluator for the plugin that owns the computed rule; other rules in the same group are evaluated declaratively and combined with `ruleLogic`.

No DSL or rule engine: declarative rules are simple field/op/value; complex logic lives in plugin code (evaluateGroup).

---

## 3. Group evaluation pipeline

**Location**: `src/lib/backend/groups/evaluate.ts`.

**Input**

- `cards: CardData[]` – cached CardData (e.g. from search or DB).
- `definitions: GroupDefinition[]` – from DB + any added suggestions.
- `evaluators: Map<pluginId, PluginGroupEvaluatorFn>` – from loaded plugins (e.g. `plugin.evaluateGroup`).

**Output**

- `Map<groupId, CardData[]>` – for each group id, the list of cards that belong.

**Algorithm**

1. For each `GroupDefinition` and each `CardData`:
   - For each rule:
     - If `rule.kind === "declarative"`: evaluate field/operator/value (e.g. via `getCardField(card, rule.field)` and operator logic).
     - If `rule.kind === "computed"`: call `evaluators.get(rule.pluginId)(card, definition)`.
   - Combine rule results with `definition.ruleLogic` (and → all true, or → at least one true).
2. If the card matches, add it to the group’s list in the result map.

**Properties**

- Deterministic: same cards + definitions + evaluators → same map.
- No I/O: uses only in-memory cards and definitions.
- Debuggable: rule results are simple booleans; computed rule is a single plugin call.

---

## 4. Persistence strategy (SQLite schema-level)

Only **group definitions** are persisted. **Membership is never stored.**

**Table: `group_definitions`**

| Column               | Type    | Description |
|----------------------|---------|-------------|
| id                   | TEXT PK | Unique id (UUID for user, plugin:id for suggested). |
| name                 | TEXT    | Display name (user-editable). |
| description          | TEXT    | Optional. |
| source               | TEXT    | `"user"` \| `"suggested"`. |
| suggested_plugin_id  | TEXT    | Set when source = suggested. |
| suggested_template_id| TEXT    | Plugin’s suggestion id (for linking). |
| rules_json           | TEXT    | JSON array of GroupRule (declarative + computed). |
| rule_logic           | TEXT    | `"and"` \| `"or"`. |
| created_at           | TEXT    | ISO 8601. |
| updated_at           | TEXT    | ISO 8601, optional. |

- No table for “card X in group Y”. Membership is always recomputed from `group_definitions` + cached CardData.
- Rust (Tauri) reads/writes this table via IPC; the frontend sends/receives GroupDefinition JSON.

---

## 5. Separation of concerns

### Groups vs Folders

| Groups | Folders |
|--------|--------|
| Logical views: “all cards matching these rules”. | Explicit membership: user puts items in a folder. |
| Membership derived from CardData + rules. | Membership stored (e.g. folder_id on item or join table). |
| No “move” – a card is in or out by evaluation. | User can move/copy items between folders. |
| Used for filtering and browsing. | Used for organization and snapshots. |

This app uses **groups** only (logical, derived). If folders are added later, they would be a separate concept with stored membership.

### Filtering vs Curation

| Filtering | Curation (groups) |
|-----------|-------------------|
| Transient: “show me results that match this query/filters”. | Named, persisted definitions: “High value”, “Needs grade”. |
| Applied at search time (query + filters). | Applied over cached CardData (e.g. current result set or DB subset). |
| No persistence of filter state as a first-class entity. | Group definitions persisted; membership computed. |

Groups are **curated views** (saved rule sets); search/filters are **ad-hoc constraints**. They can be combined: e.g. run search, then “view these results by group” (evaluate groups over the search result cards).

---

## 6. UX behavior guidance

### How groups appear in the UI

- List group definitions (name, description, source) in a sidebar or panel. Differentiate **user** vs **suggested** (e.g. “From: Plugin X”).
- Selecting a group shows the **computed** member cards (from the current card set). Do not show a “stored” list; always show the result of evaluation so it stays correct as data changes.
- Optional: show member count (e.g. “High value (12)”) by running evaluation over the current cache; update when cache or definitions change.

### How renaming affects suggested groups

- **Rename** = update `name` on the persisted GroupDefinition. Do not change `suggestedByPluginId` or `suggestedTemplateId`.
- If the plugin re-exports suggestions (e.g. after update), the app can match by `suggestedTemplateId` and optionally refresh description/rules from the suggestion, but **user-edited name is kept** (do not overwrite with plugin name). Explicit rule: “once the user renames, that name is the source of truth for display.”

### How group filters interact with search queries

- **Option A – Groups over search results**: Run search → get CardData[] → evaluate groups over that array → show “Search results” and “By group: X” with the same cards filtered by group. Group selection narrows the visible set to members of that group.
- **Option B – Group as filter**: Treat “current group” as an extra filter: only show cards that (1) match the search query and (2) belong to the selected group. Implementation: run search, then evaluate groups, then intersect (cards in both result set and group).
- **Recommendation**: Option A or B depending on product preference; keep the contract “groups are evaluated over a CardData[]” (either full cache or search result). Do not persist “last search + last group” as a single blob; keep search and group as separate concepts so the UI can show “Search: X” and “Group: Y” independently.

---

## 7. Summary

- **GroupDefinition** and **GroupRule** (declarative + computed) define the model; only definitions are persisted.
- Plugins declare **suggested groups** (Group[]) and **evaluateGroup** for computed rules.
- **evaluateGroups(cards, definitions, evaluators)** → `Map<groupId, CardData[]>` is the pipeline; no stored membership.
- SQLite stores **group_definitions** only; Rust handles read/write.
- **Groups ≠ Folders** (logical vs stored membership); **Filtering ≠ Curation** (transient query vs saved rule set).
- UX: show groups as computed member lists; preserve user renames; combine search and group selection explicitly.
