/**
 * Server-side configuration. Never import this from a client component:
 * none of these values may reach the browser.
 */
export type ServerConfig = {
  demoMode: boolean;
  ai: { provider: "anthropic" | "openai-compatible"; apiKey: string; model: string; baseUrl: string | null } | null;
  search: {
    brave: { apiKey: string; baseUrl: string } | null;
    googleFactCheck: { apiKey: string } | null;
  };
};

function value(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function getServerConfig(): ServerConfig {
  const demoMode = value("ORIVIO_DEMO_MODE") === "true";
  const provider = value("AI_PROVIDER") === "openai-compatible" ? "openai-compatible" : "anthropic";
  const aiKey = value("AI_API_KEY") ?? (provider === "anthropic" ? value("ANTHROPIC_API_KEY") : null);
  const aiBase = value("AI_API_BASE_URL");
  const aiModel = value("AI_MODEL");

  const ai =
    !demoMode && aiKey && (provider === "anthropic" || (aiBase && aiModel))
      ? {
          provider,
          apiKey: aiKey,
          model: aiModel ?? "claude-opus-5-5",
          baseUrl: aiBase,
        } as const
      : null;

  const braveKey = value("SEARCH_API_KEY");
  const factCheckKey = value("GOOGLE_FACT_CHECK_API_KEY");

  return {
    demoMode,
    ai,
    search: {
      brave: !demoMode && braveKey
        ? { apiKey: braveKey, baseUrl: value("SEARCH_API_BASE_URL") ?? "https://api.search.brave.com/res/v1/web/search" }
        : null,
      googleFactCheck: !demoMode && factCheckKey ? { apiKey: factCheckKey } : null,
    },
  };
}
