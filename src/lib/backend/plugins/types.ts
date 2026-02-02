/**
 * Plugin system: interface, manifest schema, and contracts.
 *
 * Plugins are self-contained modules. The core app does not require code changes
 * to load new plugins; discovery is manifest-driven, and search forms are
 * generated from plugin manifests (searchable fields + field types).
 */

import type {
  CardData,
  SearchQuery,
  AutocompleteSuggestion,
  Group,
} from "../types";

// =============================================================================
// Manifest: searchable fields and field types (for UI form generation)
// =============================================================================

/**
 * Field type for form generation. UI renders the appropriate input.
 */
export type SearchableFieldType =
  | "text"      // Free text
  | "number"    // Numeric (min/max optional)
  | "date"      // ISO date string
  | "select"    // Single choice from options
  | "multiselect" // Multiple choices
  | "boolean";  // Checkbox

/**
 * One searchable field declared by a plugin. Frontend uses this to build
 * filter controls (inputs, dropdowns) without plugin-specific code.
 */
export interface SearchableField {
  /** Unique key; used as filter key in SearchQuery.filters. */
  id: string;
  /** Label for the form control. */
  label: string;
  /** Type of input to render. */
  type: SearchableFieldType;
  /** For select/multiselect: choices. Value is stored; label is optional display. */
  options?: { value: string; label?: string }[];
  /** Optional placeholder or hint. */
  placeholder?: string;
  /** For number: optional min/max (UI validation). */
  min?: number;
  max?: number;
  /** When true, this field shows autocomplete UI and plugin.autocomplete is called with its value. */
  autocomplete?: boolean;
}

/**
 * Plugin manifest: declarative metadata. Stored in plugin.json or exported
 * from the plugin entry. Core uses this for discovery and form generation;
 * no app code changes needed when a plugin adds new fields.
 */
export interface PluginManifest {
  /** Unique plugin id (e.g. "example", "coins"). */
  id: string;
  /** Display name (e.g. "Example plugin", "Coin catalog"). */
  displayName: string;
  /** Semantic version (e.g. "1.0.0"). */
  version?: string;
  /** Fields this plugin can search/filter by. UI builds form from this. */
  searchableFields: SearchableField[];
}

// =============================================================================
// Plugin entry contract (what the plugin module exports)
// =============================================================================

/**
 * Raw search result from a plugin (plugin-specific shape). The core calls
 * plugin.normalize() on each item to get CardData.
 */
export type PluginRawItem = unknown;

/**
 * Search function: runs locally, returns plugin-specific raw items.
 * Core will call normalize() on each item to produce CardData.
 */
export type PluginSearchFn = (
  query: SearchQuery
) => Promise<{ items: PluginRawItem[]; total?: number }>;

/**
 * Autocomplete function: returns suggestions for the current query/context.
 */
export type PluginAutocompleteFn = (
  partialQuery: string,
  context?: { filters?: Record<string, unknown> }
) => Promise<AutocompleteSuggestion[]>;

/**
 * Normalization: one raw item from this plugin → CardData. Must be pure
 * and synchronous for predictability; no I/O.
 */
export type PluginNormalizeFn = (rawItem: PluginRawItem) => CardData;

/**
 * Optional valuation logic: given a CardData (e.g. from DB or search),
 * compute or enrich valuations (e.g. price lookup, grade). Can be async.
 * If not provided, cards are used as-is.
 */
export type PluginEnrichFn = (card: CardData) => Promise<CardData>;

/**
 * Optional: suggested group definitions (e.g. "High value", "Needs grade").
 * User can add these as saved groups; membership is derived by rules or evaluator.
 */
export type PluginSuggestedGroupsFn = () => Group[];

/**
 * Optional: custom group membership when rule-based evaluation is not enough.
 * If a group has a computed evaluator (e.g. plugin id matches), core can call
 * this. Return true if card belongs in the group.
 */
export type PluginGroupEvaluatorFn = (
  card: CardData,
  group: Group
) => boolean;

/**
 * Plugin module export. Every plugin entry must export an object that
 * satisfies this interface. Manifest can be inline or loaded separately;
 * if loaded separately, manifest in plugin.json must match.
 */
export interface Plugin {
  /** Manifest (id, displayName, searchableFields). Can be same as plugin.json. */
  manifest: PluginManifest;

  /** Search: returns raw items; core calls normalize on each. */
  search: PluginSearchFn;

  /** Autocomplete suggestions. */
  autocomplete: PluginAutocompleteFn;

  /** Raw item → CardData. */
  normalize: PluginNormalizeFn;

  /** Optional: enrich card with valuations. */
  enrich?: PluginEnrichFn;

  /** Optional: suggested groups for the user to add. */
  suggestedGroups?: Group[] | PluginSuggestedGroupsFn;

  /** Optional: custom group membership evaluator. */
  evaluateGroup?: PluginGroupEvaluatorFn;
}

// =============================================================================
// Discovery: descriptor returned by host (Rust) for loading
// =============================================================================

/**
 * Plugin descriptor returned from list_plugins (Tauri). Tells the loader
 * where to load the plugin entry from; manifest in plugin.json may be
 * used for quick form generation before the plugin module is loaded.
 */
export interface PluginDescriptor {
  /** Plugin id (from manifest). */
  id: string;
  /** Display name (from manifest). */
  displayName: string;
  /** Version if present (from manifest). */
  version?: string;
  /** Searchable fields (from manifest); used to build forms before load. */
  searchableFields: SearchableField[];
  /**
   * URL or path to the plugin entry module for dynamic import.
   * Must be resolvable by the WebView (e.g. asset URL, or path Tauri serves).
   */
  entryUrl: string;
  /** Whether the plugin is enabled (from app config). */
  enabled?: boolean;
}
