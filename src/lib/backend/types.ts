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
 * Operators for matching a CardData field (or valuation) against a value.
 * "exists" checks presence (value optional); "in" expects array value.
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
 * A single rule: "field OP value". Groups are defined as a list of rules;
 * logical relationship between rules (AND/OR) is expressed at Group level.
 */
export interface GroupRule {
  /** Stable id for the rule. */
  id: string;

  /**
   * CardData path: top-level ("title", "type", "sourcePluginId") or
   * valuation ("valuations.price", "valuations.grade"). Dot notation.
   */
  field: string;

  /** Comparison operator. */
  operator: GroupRuleOperator;

  /**
   * Value to compare against. Type depends on operator (e.g. string for eq,
   * number for gt, string[] for in). Omit for "exists".
   */
  value?: unknown;
}

/**
 * Logical relationship between rules in a group.
 * - "and": card must match all rules.
 * - "or": card must match at least one rule.
 */
export type GroupRuleLogic = "and" | "or";

/**
 * A logical group: a named set of rules. Membership is not stored;
 * at runtime, evaluate rules against CardData to get the set of cards.
 * Persisted as definition only; derived card list can be cached in memory
 * but not as source of truth.
 */
export interface Group {
  /** Unique id. */
  id: string;

  /** Display name. */
  name: string;

  /** Optional description. */
  description?: string;

  /** Rules that define membership (e.g. type eq "coin", valuations.price.gte 100). */
  rules: GroupRule[];

  /** How to combine rules: all must match (and) or any (or). */
  ruleLogic: GroupRuleLogic;

  /** When the group was created (ISO 8601). */
  createdAt: string;

  /** When the group was last updated (ISO 8601). */
  updatedAt?: string;
}
