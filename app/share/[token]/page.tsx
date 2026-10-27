"use client";

import { Eye, FileQuestion } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportView } from "@/components/reports/report-view";
import { Card, EmptyState } from "@/components/ui/primitives";
import { upgrade } from "@/lib/database/investigations-store";
import { getSupabaseClient } from "@/lib/database/supabase";
import { usePreferences } from "@/lib/i18n/preferences";
import { investigationSchema } from "@/lib/validation/investigation";
import type { Investigation } from "@/types/investigation";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; investigation: Investigation };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export default function SharedReportPage() {
  const { t } = usePreferences();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !TOKEN_PATTERN.test(token)) {
      setState({ kind: "missing" });
      return;
    }
    let active = true;
    client.rpc("get_shared_report", { token }).then(({ data, error }) => {
      if (!active) return;
      // The document is the owner's data: validate its shape before rendering it.
      const parsed = !error && data ? investigationSchema.safeParse(data) : null;
      setState(parsed?.success ? { kind: "ready", investigation: upgrade(parsed.data as Investigation) } : { kind: "missing" });
    });
    return () => {
      active = false;
    };
  }, [token]);

  if (state.kind === "loading") return <p className="text-sm text-muted">{t.common.loading}</p>;
  if (state.kind === "missing") {
    return <Card><EmptyState icon={FileQuestion} title={t.share.notFound} /></Card>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-fg"><Eye size={16} className="text-accent" aria-hidden /> {t.share.banner}</span>
        <span className="text-xs text-muted">{t.share.by}</span>
      </div>
      <ReportView investigation={state.investigation} />
    </div>
  );
}
