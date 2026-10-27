"use client";

import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, buttonClass } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";

/** Served by the service worker when a page is requested without a connection. */
export default function OfflinePage() {
  const { t } = usePreferences();
  return (
    <Card>
      <EmptyState icon={WifiOff} title={t.failure.offline}>
        <p className="mt-2 max-w-md text-sm text-muted">{t.failure.offlineText}</p>
        <Link href="/investigations" className={`${buttonClass.secondary} mt-4`}>{t.nav.investigations}</Link>
      </EmptyState>
    </Card>
  );
}
