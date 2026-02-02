/**
 * Plugin discovery and loading strategy.
 *
 * Discovery: performed by the host (Tauri). Rust scans the plugin directory,
 * reads each plugin.json manifest, and returns a list of PluginDescriptors
 * via list_plugins IPC. The frontend receives descriptors; it does not
 * scan the filesystem.
 *
 * Loading: the frontend (or a bridge) calls loadPlugins(descriptors). For each
 * descriptor with entryUrl and enabled !== false, we dynamic-import the
 * entry module and validate its default export against the Plugin interface.
 * Loaded plugins are returned in a map keyed by id.
 *
 * No core application code is modified to add a plugin: drop a folder with
 * plugin.json + entry in the plugin dir, and list_plugins will include it.
 */

import type { Plugin, PluginDescriptor, SearchableField } from "./types";

/**
 * Load plugins from descriptors (from Tauri list_plugins). Each descriptor
 * must have entryUrl pointing to a module that exports a Plugin-compatible
 * object (default export).
 *
 * @param descriptors - From list_plugins IPC
 * @returns Map of plugin id → loaded Plugin. Failed loads are omitted; errors are logged.
 */
export async function loadPlugins(
  descriptors: PluginDescriptor[]
): Promise<Map<string, Plugin>> {
  const map = new Map<string, Plugin>();

  await Promise.all(
    descriptors
      .filter((d) => d.enabled !== false && d.entryUrl)
      .map(async (d) => {
        try {
          const plugin = await loadOnePlugin(d.entryUrl, d.id);
          if (plugin) map.set(d.id, plugin);
        } catch (err) {
          console.error(`[plugins] Failed to load plugin "${d.id}":`, err);
        }
      })
  );

  return map;
}

/**
 * Load a single plugin by URL. Uses dynamic import; entryUrl must be
 * resolvable by the environment (e.g. asset URL in Tauri).
 */
export async function loadOnePlugin(
  entryUrl: string,
  expectedId?: string
): Promise<Plugin | null> {
  const module = await import(/* @vite-ignore */ entryUrl);
  const candidate = module.default ?? module.plugin ?? module;

  if (!candidate || typeof candidate !== "object") {
    console.error(`[plugins] Entry did not export a plugin object: ${entryUrl}`);
    return null;
  }

  if (!isPlugin(candidate)) {
    console.error(`[plugins] Export does not satisfy Plugin interface: ${entryUrl}`);
    return null;
  }

  if (expectedId != null && candidate.manifest.id !== expectedId) {
    console.error(
      `[plugins] Manifest id "${candidate.manifest.id}" does not match descriptor "${expectedId}"`
    );
    return null;
  }

  return candidate as Plugin;
}

/**
 * Type guard: check that an object has the required Plugin shape.
 * Does not validate manifest.searchableFields structure in depth.
 */
function isPlugin(obj: unknown): obj is Plugin {
  if (obj == null || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.manifest === "object" &&
    o.manifest != null &&
    typeof (o.manifest as Record<string, unknown>).id === "string" &&
    typeof (o.manifest as Record<string, unknown>).displayName === "string" &&
    Array.isArray((o.manifest as Record<string, unknown>).searchableFields) &&
    typeof o.search === "function" &&
    typeof o.autocomplete === "function" &&
    typeof o.normalize === "function"
  );
}

/**
 * Merge searchable fields from multiple plugins into one list. Useful for
 * building a single search form that includes all enabled plugins' fields.
 * Prefixes field ids with plugin id to avoid collisions (e.g. "example:title").
 */
export function mergeSearchableFields(
  descriptors: PluginDescriptor[],
  options?: { prefixWithPluginId?: boolean }
): SearchableField[] {
  const prefix = options?.prefixWithPluginId !== false;
  const out: SearchableField[] = [];

  for (const d of descriptors) {
    if (!d.searchableFields?.length) continue;
    for (const f of d.searchableFields) {
      out.push({
        ...f,
        id: prefix ? `${d.id}:${f.id}` : f.id,
        label: prefix ? `${f.label} (${d.displayName})` : f.label,
      });
    }
  }

  return out;
}
