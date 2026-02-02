/**
 * Group evaluation pipeline: compute membership from cached CardData.
 *
 * Input: CardData[], GroupDefinition[], plugin evaluators (pluginId → evaluateGroup).
 * Output: Map<groupId, CardData[]>.
 *
 * No membership is stored; each run is deterministic and debuggable.
 */

import type { CardData, GroupDefinition, Group, DeclarativeGroupRule } from "../types";
import type { PluginGroupEvaluatorFn } from "../plugins/types";

/**
 * Evaluators keyed by plugin id. Used only for rules with kind === "computed".
 */
export type GroupEvaluatorMap = Map<string, PluginGroupEvaluatorFn>;

/**
 * Get a value from CardData by dot path (e.g. "title", "valuations.price.value").
 * Returns undefined if path is missing or invalid.
 */
export function getCardField(card: CardData, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = card;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a single declarative rule against a card.
 */
function evaluateDeclarativeRule(
  card: CardData,
  rule: DeclarativeGroupRule
): boolean {
  const fieldValue = getCardField(card, rule.field);

  switch (rule.operator) {
    case "eq":
      return fieldValue === rule.value;
    case "neq":
      return fieldValue !== rule.value;
    case "contains": {
      const v = rule.value;
      if (typeof fieldValue === "string" && typeof v === "string")
        return fieldValue.includes(v);
      if (Array.isArray(fieldValue)) return fieldValue.includes(v);
      return false;
    }
    case "gt":
      return typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue > rule.value;
    case "gte":
      return typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue >= rule.value;
    case "lt":
      return typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue < rule.value;
    case "lte":
      return typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue <= rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(fieldValue);
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    default:
      return false;
  }
}

/**
 * Evaluate one group definition against one card. Uses declarative rules
 * and, if present, the plugin evaluator for computed rules.
 */
function cardBelongsToGroup(
  card: CardData,
  definition: GroupDefinition,
  evaluators: GroupEvaluatorMap
): boolean {
  const ruleResults: boolean[] = [];

  for (const rule of definition.rules) {
    if (rule.kind === "declarative") {
      ruleResults.push(evaluateDeclarativeRule(card, rule));
    } else {
      const fn = evaluators.get(rule.pluginId);
      if (!fn) ruleResults.push(false);
      else ruleResults.push(fn(card, definition as unknown as Group));
    }
  }

  if (ruleResults.length === 0) return false;

  return definition.ruleLogic === "and"
    ? ruleResults.every(Boolean)
    : ruleResults.some(Boolean);
}

/**
 * Compute group membership for all definitions over the given cards.
 *
 * @param cards - Cached CardData (e.g. from search or DB).
 * @param definitions - Group definitions (from DB + added suggestions).
 * @param evaluators - Plugin evaluateGroup fns keyed by plugin id.
 * @returns Map of group id → cards that belong to that group.
 */
export function evaluateGroups(
  cards: CardData[],
  definitions: GroupDefinition[],
  evaluators: GroupEvaluatorMap
): Map<string, CardData[]> {
  const result = new Map<string, CardData[]>();

  for (const def of definitions) {
    const members = cards.filter((card) =>
      cardBelongsToGroup(card, def, evaluators)
    );
    result.set(def.id, members);
  }

  return result;
}
