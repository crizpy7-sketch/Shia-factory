/**
 * Provider selection. Adding a vendor means adding an adapter here — the agent core is untouched.
 */
import { Config } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { ScriptedProvider } from './scripted.js';
import { getNamedScript } from './scripts.js';
import { ModelProvider } from './types.js';

export * from './types.js';
export { AnthropicProvider } from './anthropic.js';
export { ScriptedProvider, scriptedSequence } from './scripted.js';
export { getNamedScript } from './scripts.js';

/** Adapters that exist today. Names map 1:1 to BORIS_PROVIDER. */
export const KNOWN_PROVIDERS = ['anthropic', 'scripted'] as const;

/**
 * Vendors with a defined place in the abstraction but no adapter implemented yet.
 * Listed so the gap is visible instead of implied.
 */
export const PLANNED_PROVIDERS = ['openai', 'moonshot', 'xai', 'local'] as const;

export function createProvider(config: Config): ModelProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.anthropicBaseUrl,
      });
    case 'scripted': {
      // Deliberately gated: the test double is unreachable unless a human opts in explicitly.
      if (process.env['BORIS_ALLOW_TEST_PROVIDER'] !== 'true') {
        throw new Error(
          'The scripted provider is a test double. Set BORIS_ALLOW_TEST_PROVIDER=true to use it, ' +
          'and never in production.',
        );
      }
      const scriptName = process.env['BORIS_SCRIPT'] ?? 'fixture-repair';
      return new ScriptedProvider(getNamedScript(scriptName), `scripted:${scriptName}`);
    }
    default:
      throw new Error(
        `Unknown provider "${config.provider}". Implemented: ${KNOWN_PROVIDERS.join(', ')}. ` +
        `Planned (not implemented): ${PLANNED_PROVIDERS.join(', ')}.`,
      );
  }
}
