import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config/env";
import { isSupabaseConfigured } from "@/lib/database/supabase";

export const dynamic = "force-dynamic";

/** Reports which integrations are active. Exposes provider names only, never keys. */
export async function GET() {
  const config = getServerConfig();
  return NextResponse.json({
    demoMode: config.demoMode,
    ai: config.ai ? { provider: config.ai.provider, model: config.ai.model } : null,
    search: [config.search.brave && "brave", config.search.googleFactCheck && "google_fact_check"].filter(Boolean),
    database: isSupabaseConfigured() ? "supabase" : "local",
  });
}
