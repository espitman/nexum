import { AppError, err, ok, type Result } from "@nexum/shared";
import type { NexumPlugin } from "./contracts.ts";

export class PluginRegistry {
  readonly #plugins = new Map<string, NexumPlugin>();

  register(plugin: NexumPlugin): Result<NexumPlugin> {
    if (this.#plugins.has(plugin.id)) {
      return err(
        new AppError(
          "PLUGIN_ALREADY_REGISTERED",
          `Plugin "${plugin.id}" is already registered`,
          { details: { pluginId: plugin.id } },
        ),
      );
    }

    this.#plugins.set(plugin.id, plugin);
    return ok(plugin);
  }

  get(pluginId: string): Result<NexumPlugin> {
    const plugin = this.#plugins.get(pluginId);

    if (!plugin) {
      return err(
        new AppError("PLUGIN_NOT_FOUND", `Plugin "${pluginId}" was not found`, {
          details: { pluginId },
        }),
      );
    }

    return ok(plugin);
  }

  has(pluginId: string): boolean {
    return this.#plugins.has(pluginId);
  }

  list(): NexumPlugin[] {
    return [...this.#plugins.values()];
  }

  unregister(pluginId: string): Result<NexumPlugin> {
    const plugin = this.get(pluginId);

    if (!plugin.ok) {
      return plugin;
    }

    this.#plugins.delete(pluginId);
    return plugin;
  }
}
