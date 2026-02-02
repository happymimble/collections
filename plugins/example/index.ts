/**
 * Example plugin skeleton. Demonstrates the Plugin interface:
 * manifest, search, autocomplete, normalize, optional enrich and suggestedGroups.
 *
 * This module is loaded by the core via dynamic import; it must export
 * a default object satisfying the Plugin interface.
 *
 * When developed in-repo, path aliases (e.g. $lib/backend) can resolve these
 * imports; for distribution, bundle the plugin with the app types or use
 * a shared types package.
 */

import type { CardData, SearchQuery, AutocompleteSuggestion, Group } from "../../src/lib/backend/types";
import type { Plugin, SearchableField } from "../../src/lib/backend/plugins/types";

const PLUGIN_ID = "example";

const searchableFields: SearchableField[] = [
  { id: "query", label: "Search text", type: "text", placeholder: "Enter search..." },
  {
    id: "category",
    label: "Category",
    type: "select",
    options: [
      { value: "any", label: "Any" },
      { value: "a", label: "Category A" },
      { value: "b", label: "Category B" },
    ],
  },
  { id: "minValue", label: "Min value", type: "number", min: 0, placeholder: "0" },
];

/** Raw item shape for this plugin (internal). */
interface ExampleRawItem {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  value?: number;
}

const plugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    displayName: "Example plugin",
    version: "1.0.0",
    searchableFields,
  },

  async search(query: SearchQuery): Promise<{ items: ExampleRawItem[]; total?: number }> {
    // In a real plugin: use query.query and query.filters to query local data or API.
    // Return raw items; core will call normalize() on each.
    const category = query.filters?.category as string | undefined;
    const minValue = query.filters?.minValue as number | undefined;
    const limit = query.limit ?? 10;

    // Stub: return a few fake raw items.
    const items: ExampleRawItem[] = [
      { id: "1", title: "Example item 1", subtitle: "Category A", category: "a", value: 100 },
      { id: "2", title: "Example item 2", subtitle: "Category B", category: "b", value: 200 },
    ]
      .filter((i) => !category || category === "any" || i.category === category)
      .filter((i) => minValue == null || (i.value != null && i.value >= minValue))
      .slice(0, limit);

    return { items, total: items.length };
  },

  async autocomplete(
    partialQuery: string,
    _context?: { filters?: Record<string, unknown> }
  ): Promise<AutocompleteSuggestion[]> {
    // Stub: return suggestions based on partial query.
    if (partialQuery.length === 0) return [];
    return [
      { text: partialQuery + " (suggestion 1)", label: "Suggestion 1", type: "term" },
      { text: partialQuery + " (suggestion 2)", label: "Suggestion 2", type: "term" },
    ];
  },

  normalize(rawItem: unknown): CardData {
    const item = rawItem as ExampleRawItem;
    const now = new Date().toISOString();
    return {
      id: `${PLUGIN_ID}:${item.id}`,
      type: "example",
      title: item.title,
      subtitle: item.subtitle,
      sourcePluginId: PLUGIN_ID,
      sourceRef: item.id,
      createdAt: now,
      updatedAt: now,
      ...(item.value != null && {
        valuations: {
          value: {
            value: item.value,
            unit: "USD",
          },
        },
      }),
    };
  },

  async enrich(card: CardData): Promise<CardData> {
    // Optional: add or update valuations (e.g. lookup price, grade).
    // Stub: return as-is.
    return card;
  },

  suggestedGroups: (): Group[] => [
    {
      id: `${PLUGIN_ID}:high-value`,
      name: "High value (example)",
      description: "Items with value ≥ 150",
      rules: [
        {
          kind: "declarative",
          id: "r1",
          field: "valuations.value.value",
          operator: "gte",
          value: 150,
        },
      ],
      ruleLogic: "and",
      createdAt: new Date().toISOString(),
    },
  ],

  evaluateGroup(card: CardData, group: Group): boolean {
    // Optional: custom membership when rule evaluation is not enough.
    if (group.id === `${PLUGIN_ID}:high-value`) {
      const v = card.valuations?.value?.value;
      return typeof v === "number" && v >= 150;
    }
    return false;
  },
};

export default plugin;
