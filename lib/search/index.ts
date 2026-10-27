import type { ServerConfig } from "../config/env";
import { GoogleFactCheckProvider } from "../fact-check/google";
import { BraveSearchProvider } from "./brave";
import type { SearchProvider } from "./types";

export function createSearchProviders(config: ServerConfig["search"]): SearchProvider[] {
  const providers: SearchProvider[] = [];
  if (config.brave) providers.push(new BraveSearchProvider(config.brave.apiKey, config.brave.baseUrl));
  if (config.googleFactCheck) providers.push(new GoogleFactCheckProvider(config.googleFactCheck.apiKey));
  return providers;
}

export type { SearchProvider, SearchResult } from "./types";
