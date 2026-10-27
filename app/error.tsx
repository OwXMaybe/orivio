"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Card, EmptyState, buttonClass } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";

/** Route-level error boundary: the sidebar and the rest of the app keep working. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = usePreferences();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <EmptyState icon={AlertTriangle} title={t.failure.title}>
        <p className="mt-2 max-w-md text-sm text-muted">{t.failure.text}</p>
        {/* The digest identifies the server log entry without exposing error details. */}
        {error.digest && <p className="mt-2 font-mono text-[11px] text-muted">{t.failure.reference}: {error.digest}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className={buttonClass.primary}><RotateCcw size={15} aria-hidden /> {t.failure.retry}</button>
          <Link href="/dashboard" className={buttonClass.secondary}>{t.failure.home}</Link>
        </div>
      </EmptyState>
    </Card>
  );
}
