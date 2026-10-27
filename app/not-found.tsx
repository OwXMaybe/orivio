"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, buttonClass } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";

export default function NotFound() {
  const { t } = usePreferences();
  return (
    <Card>
      <EmptyState icon={Compass} title={t.failure.notFound}>
        <p className="mt-2 text-sm text-muted">{t.failure.notFoundText}</p>
        <Link href="/dashboard" className={`${buttonClass.secondary} mt-4`}>{t.failure.home}</Link>
      </EmptyState>
    </Card>
  );
}
