"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { setPendingInput } from "@/components/investigation/pending-input";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { EXAMPLE_CLAIMS } from "@/lib/explore/examples";
import { usePreferences } from "@/lib/i18n/preferences";

export default function ExplorePage() {
  const { t, language } = usePreferences();
  const router = useRouter();

  return (
    <div>
      <PageHeader title={t.explore.title} intro={t.explore.intro} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {EXAMPLE_CLAIMS.map((ex) => (
          <li key={ex.en}>
            <Card as="article" className="flex h-full flex-col p-4">
              <Badge tone="blue" className="self-start">{t.category[ex.category]}</Badge>
              <p className="mt-3 flex-1 text-sm leading-6 text-fg">{ex[language]}</p>
              <button
                type="button"
                onClick={() => {
                  setPendingInput(ex[language], language);
                  router.push("/investigate");
                }}
                className="mt-4 inline-flex items-center gap-1.5 self-start text-sm text-accent hover:underline"
              >
                {t.explore.investigate} <ArrowRight size={14} aria-hidden />
              </button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
