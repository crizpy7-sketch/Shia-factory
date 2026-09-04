import type { ProviderCapabilities } from '../../providers/types.js';
import type {
  ProviderCompatibilityGap,
  ProviderCompatibilityResult,
  ProviderRequirements,
} from './types.js';

/**
 * Pure capability match: READY iff every required capability is satisfied.
 * Fails closed on insufficiency (any gap → INCOMPATIBLE).
 */
export function matchProviderRequirements(
  requirements: ProviderRequirements,
  capabilities: ProviderCapabilities,
): ProviderCompatibilityResult {
  const gaps: ProviderCompatibilityGap[] = [];

  if (requirements.toolCalls === true && !capabilities.toolCalls) {
    gaps.push({
      capability: 'toolCalls',
      required: true,
      actual: capabilities.toolCalls,
      message: 'provider does not support tool calling',
    });
  }

  if (requirements.structuredOutput === true && !capabilities.structuredOutput) {
    gaps.push({
      capability: 'structuredOutput',
      required: true,
      actual: capabilities.structuredOutput,
      message: 'provider does not support structured output',
    });
  }

  if (requirements.reasoning === true && !capabilities.reasoning) {
    gaps.push({
      capability: 'reasoning',
      required: true,
      actual: capabilities.reasoning,
      message: 'provider does not support reasoning',
    });
  }

  if (requirements.streaming === true && !capabilities.streaming) {
    gaps.push({
      capability: 'streaming',
      required: true,
      actual: capabilities.streaming,
      message: 'provider does not support streaming',
    });
  }

  if (
    typeof requirements.minContextWindow === 'number' &&
    capabilities.contextWindow < requirements.minContextWindow
  ) {
    gaps.push({
      capability: 'minContextWindow',
      required: requirements.minContextWindow,
      actual: capabilities.contextWindow,
      message: `provider context window ${capabilities.contextWindow} is below required ${requirements.minContextWindow}`,
    });
  }

  if (
    typeof requirements.minMaxOutputTokens === 'number' &&
    capabilities.maxOutputTokens < requirements.minMaxOutputTokens
  ) {
    gaps.push({
      capability: 'minMaxOutputTokens',
      required: requirements.minMaxOutputTokens,
      actual: capabilities.maxOutputTokens,
      message: `provider maxOutputTokens ${capabilities.maxOutputTokens} is below required ${requirements.minMaxOutputTokens}`,
    });
  }

  return {
    status: gaps.length === 0 ? 'READY' : 'INCOMPATIBLE',
    gaps,
  };
}
