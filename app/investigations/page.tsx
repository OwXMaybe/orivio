"use client";

import { FolderSearch, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { InvestigationRow } from "@/components/investigation/investigation-row";
import { Card, EmptyState, PageHeader, buttonClass, cn, inputClass } from "@/components/ui/primitives";
import { useAuth } from "@/components/auth/auth-provider";
import { useCollections } from "@/lib/database/account-data";
import { deleteInvestigation, updateInvestigation, useInvestigations, useStoreError, useStoreReady } from "@/lib/database/investigations-store";
import { usePreferences } from "@/lib/i18n/preferences";
import { CLAIM_CATEGORIES, type ClaimCategory } from "@/types/claim";

export default function InvestigationsPage() {
  const { t } = usePreferences();
  const investigations = useInvestigations();
  const ready = useStoreReady();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ClaimCategory | "all">("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { user, client } = useAuth();
  const collections = useCollections(user ? client : null);
  const [collectionId, setCollectionId] = useState<string>("all");
  const syncError = useStoreError();

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const inCollection = collectionId === "all" ? null : new Set(collections.data.find((c) => c.id === collectionId)?.investigationIds ?? []);
    return investigations.filter(
      (inv) =>
        (category === "all" || inv.primaryCategory === category) &&
        (!favoritesOnly || inv.favorite) &&
        (!inCollection || inCollection.has(inv.id)) &&
        (!q || inv.input.toLocaleLowerCase().includes(q) || inv.claims.some((c) => c.text.toLocaleLowerCase().includes(q))),
    );
  }, [investigations, query, category, favoritesOnly, collectionId, collections.data]);

  return (
    <div>
      <PageHeader title={t.list.title} intro={user ? t.list.introAccount : t.list.intro} />
      {syncError && <p role="alert" className="mb-4 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">{t.sync[syncError] ?? t.errors.generic}</p>}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t.list.search}</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.list.search} className={cn(inputClass, "pl-9")} />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value as ClaimCategory | "all")} className={cn(inputClass, "sm:w-56")} aria-label={t.report.category}>
          <option value="all">{t.list.allCategories}</option>
          {CLAIM_CATEGORIES.map((c) => <option key={c} value={c}>{t.category[c]}</option>)}
        </select>
        {user && collections.data.length > 0 && (
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className={cn(inputClass, "sm:w-48")} aria-label={t.collections.title}>
            <option value="all">{t.collections.all}</option>
            {collections.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setFavoritesOnly((v) => !v)} aria-pressed={favoritesOnly} className={cn(buttonClass.secondary, favoritesOnly && "border-warn/60 text-warn")}>
          <Star size={15} className={favoritesOnly ? "fill-warn" : undefined} aria-hidden />
          {t.list.favoritesOnly}
        </button>
      </div>

      <Card>
        {!ready ? (
          <p className="p-5 text-sm text-muted">{t.common.loading}</p>
        ) : !investigations.length ? (
          <EmptyState icon={FolderSearch} title={t.list.none} />
        ) : !filtered.length ? (
          <EmptyState icon={Search} title={t.list.empty} />
        ) : (
          <ul>
            {filtered.map((inv) => (
              <InvestigationRow
                key={inv.id}
                investigation={inv}
                actions={
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => updateInvestigation(inv.id, { favorite: !inv.favorite })}
                      aria-label={inv.favorite ? t.report.unfavorite : t.report.favorite}
                      aria-pressed={inv.favorite}
                      className={buttonClass.ghost}
                    >
                      <Star size={15} className={inv.favorite ? "fill-warn text-warn" : undefined} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(t.list.confirmDelete) && deleteInvestigation(inv.id)}
                      aria-label={t.report.delete}
                      className={cn(buttonClass.ghost, "hover:text-bad")}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
