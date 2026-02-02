/**
 * Core data models for the plugin-based search and enrichment application.
 *
 * DESIGN RATIONALE
 * ----------------
 * - All types are plain JSON-serializable (no Date, Map, Set, or class instances).
 *   Use ISO 8601 strings for timestamps so SQLite and export work without adapters.
 *
 * - CardData is the single canonical shape for real-world objects. Plugins normalize
 *   into CardData so the UI can stay generic and data-driven (one card component,
 *   one export format, one snapshot format).
 *
 * - Valuations are first-class: enrichment (prices, grades, condition) is modeled
 *   as keyed values with optional ranges and sources, not freeform blobs.
 *
 * - Groups and GroupRules are definitions only; membership is derived at runtime
 *   by evaluating rules against CardData. This avoids stale card lists and keeps
 *   storage small.
 */

// =============================================================================
// Valuation (enrichment value with range and provenance)
// =============================================================================

/**
 * A single provenance entry for a valuation (e.g. guide, dealer, auction).
 */
export interface ValuationSource {
  /** Stable id (e.g. "pcgs", "ngc"). */
  id: string;
  /** Human-readable label. */
  label?: string;
  /** Optional link (URL or app-internal ref). */
  url?: string;
}

/**
 * Numeric range for valuations (e.g. grade band, price range).
 * Omit min/max for open-ended; use both for a closed interval.
 */
export interface ValuationRange {
  min?: number;
  max?: number;
  /** Display label when range is categorical (e.g. "VF-XF", "Fine"). */
  label?: string;
}

/**
 * A named value attached to a card (price, grade, condition, etc.).
 * All plugins normalize enrichment into this shape so the UI can render
 * valuations generically (table, badges, tooltips).
 */
export interface Valuation {
  /** Primary value (number or string). */
  value: number | string;
  /** Unit or scale (e.g. "USD", "grade"). */
  unit?: string;
  /** Optional numeric or categorical range. */
  range?: ValuationRange;
  /** Where this value came from (guides, plugins). */
  sources?: ValuationSource[];
}

// =============================================================================
// CardData (canonical representation)
// =============================================================================

/**
 * Canonical representation of a real-world object. Used for:
 * - Search results
 * - Hover overlays (same shape; subset of fields is valid)
 * - Folder snapshots (list of CardData)
 * - JSON export
 *
 * Plugins must normalize their results into CardData so the UI remains
 * generic and data-driven.
 */
export interface CardData {
  /** Unique stable id (e.g. UUID or plugin:id). Required. */
  id: string;

  /** Discriminator for UI (e.g. "book", "coin", "card"). Optional; UI can default. */
  type?: string;

  /** Primary label (e.g. title, name). Required for display. */
  title: string;

  /** Secondary label (e.g. author, year, short description). */
  subtitle?: string;

  /** Thumbnail or primary image (URL or app asset path). */
  imageUrl?: string;

  /**
   * Enrichment values keyed by name (e.g. "price", "grade", "condition").
   * Enables generic valuation display and filtering.
   */
  valuations?: Record<string, Valuation>;

  /** Plugin that produced or last enriched this card. */
  sourcePluginId?: string;

  /** External reference in that plugin's world (URL, id). */
  sourceRef?: string;

  /** When this card was first created (ISO 8601). */
  createdAt: string;

  /** When this card was last updated (ISO 8601). */
  updatedAt?: string;

  /**
   * Optional tags for filtering and grouping (e.g. "favorites", "sell").
   * Kept as string[] for simplicity and JSON serialization.
   */
  tags?: string[];

  /**
   * Plugin- or feature-specific data. Must be JSON-serializable.
   * UI may ignore; used for export and plugin state.
   */
  customFields?: Record<string, unknown>;
}

// =============================================================================
// Search
// =============================================================================

/**
 * Input to the search pipeline. Kept generic so plugins can interpret
 * query and filters; UI sends the same shape regardless of plugin.
 */
export interface SearchQuery {
  /** Free-text query. */
  query: string;

  /**
   * Key-value filters (e.g. type, minPrice, tags).
   * Values are JSON-serializable; arrays mean "any of".
   */
  filters?: Record<string, string | number | boolean | string[]>;

  /** Max number of cards to return. */
  limit?: number;

  /** Offset for pagination. */
  offset?: number;

  /** Restrict to these plugin ids; omit for all. */
  pluginIds?: string[];

  /** Sort by field (e.g. "title", "valuations.price", "createdAt"). */
  sortBy?: string;

  /** Sort direction. */
  sortOrder?: "asc" | "desc";
}

/**
 * Result of a search. Cards are normalized to CardData; metadata is
 * optional for UI (counts, latency, which plugin answered).
 */
export interface SearchResult {
  /** Normalized cards (plugin output normalized to CardData). */
  cards: CardData[];

  /** Total matching count if known (for "N of M" display). */
  total?: number;

  /** Query that produced this result (echo back). */
  query: SearchQuery;

  /** Plugin that returned this result (if single-plugin). */
  pluginId?: string;

  /** Latency in milliseconds (optional). */
  latencyMs?: number;
}

// =============================================================================
// Autocomplete
// =============================================================================

/**
 * A single autocomplete suggestion. UI can be generic: display label,
 * insert text, optional type for styling (term, filter, plugin).
 */
export interface AutocompleteSuggestion {
  /** Text to insert (e.g. into search box). */
  text: string;

  /** Display label if different from text (e.g. "Price: 100–200"). */
  label?: string;

  /** Hint for UI styling or behavior ("term" | "filter" | "plugin" | custom). */
  type?: string;

  /** Optional payload for UI (e.g. filter key, plugin id). Must be JSON-serializable. */
  payload?: Record<string, unknown>;
}

// =============================================================================
// Groups and GroupRules (definitions only; membership derived from CardData)
// =============================================================================

/**
 * Operators for declarative rules: equality, range, contains.
 * - eq, neq, in: equality (in expects array value).
 * - gt, gte, lt, lte: numeric/date range.
 * - contains: string/array contains (value: string or single element).
 * - exists: field is present (value optional).
 */
export type GroupRuleOperator =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "exists";

/**
 * Declarative rule: "field OP value". Evaluated by the core against CardData
 * using dot-notation field paths (e.g. "title", "valuations.price.value").
 */
export interface DeclarativeGroupRule {
  kind: "declarative";
  /** Stable id for the rule. */
  id: string;
  /** CardData path (dot notation). */
  field: string;
  operator: GroupRuleOperator;
  /** Omit for "exists". */
  value?: unknown;
}

/**
 * Computed rule: membership for this part is determined by the plugin's
 * evaluateGroup(card, group). Used when domain logic cannot be expressed
 * declaratively (e.g. complex grading, external lookup).
 */
export interface ComputedGroupRule {
  kind: "computed";
  id: string;
  /** Plugin that provides evaluateGroup(card, group). */
  pluginId: string;
}

/**
 * A single rule: either declarative (field/operator/value) or computed (plugin).
 * Groups combine rules with ruleLogic (and/or).
 */
export type GroupRule = DeclarativeGroupRule | ComputedGroupRule;

/**
 * Logical relationship between rules in a group.
 * - and: card must match all rules.
 * - or: card must match at least one rule.
 */
export type GroupRuleLogic = "and" | "or";

/**
 * Origin of a group definition. Affects UX (e.g. suggested can show plugin name,
 * user-created is fully editable).
 */
export type GroupSource = "user" | "suggested";

/**
 * Persisted group definition. Only definitions are stored; membership is
 * always computed from cached CardData at runtime.
 *
 * - user: created by the user (name, rules fully editable).
 * - suggested: from a plugin; user may add/rename; suggestedTemplateId links
 *   to the plugin's suggested group id for updates.
 */
export interface GroupDefinition {
  /** Unique id (e.g. UUID for user, plugin:id for suggested). */
  id: string;

  /** Display name (user-editable; for suggested, may override plugin name). */
  name: string;

  description?: string;

  /** user = user-created; suggested = from plugin. */
  source: GroupSource;

  /** Set when source === "suggested"; which plugin suggested this group. */
  suggestedByPluginId?: string;

  /**
   * When source === "suggested", the id of the suggestion from the plugin.
   * Used to match plugin updates (e.g. re-suggest with same template id).
   */
  suggestedTemplateId?: string;

  /** Rules that define membership (declarative and/or one computed rule). */
  rules: GroupRule[];

  ruleLogic: GroupRuleLogic;

  createdAt: string;
  updatedAt?: string;
}

/**
 * In-memory shape for plugin-suggested groups (before persistence).
 * When the user "adds" a suggestion, the app persists it as GroupDefinition
 * with source: "suggested", suggestedByPluginId, suggestedTemplateId = id.
 */
export interface Group {
  id: string;
  name: string;
  description?: string;
  rules: GroupRule[];
  ruleLogic: GroupRuleLogic;
  createdAt: string;
  updatedAt?: string;
}
