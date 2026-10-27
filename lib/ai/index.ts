import type { ServerConfig } from "../config/env";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { AIProvider } from "./types";

export function createAIProvider(config: ServerConfig["ai"]): AIProvider | null {
  if (!config) return null;
  if (config.provider === "openai-compatible" && config.baseUrl) {
    return new OpenAICompatibleProvider(config.apiKey, config.baseUrl, config.model);
  }
  return new AnthropicProvider(config.apiKey, config.model);
}

export type { AIProvider } from "./types";
