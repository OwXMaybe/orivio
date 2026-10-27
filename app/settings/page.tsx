"use client";

import { Database, Languages, LogOut, Server, Trash2, UploadCloud, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useEngineStatus } from "@/components/investigation/use-engine-status";
import { Badge, Card, CardHeader, PageHeader, buttonClass, cn } from "@/components/ui/primitives";
import { clearLocal, importLocalToAccount, readLocal } from "@/lib/database/investigations-store";
import { usePreferences, type Theme } from "@/lib/i18n/preferences";
import type { Language } from "@/types/investigation";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm", value === o.value ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { t, language, theme, researchLanguage, set } = usePreferences();
  const { status, failed: statusError } = useEngineStatus();
  const { configured, user, signOut } = useAuth();
  const [cleared, setCleared] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Local storage is only readable in the browser, after mount.
  useEffect(() => setLocalCount(readLocal().length), []);

  const languages: { value: Language; label: string }[] = [{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }];

  return (
    <div className="space-y-4">
      <PageHeader title={t.settings.title} />

      <Card>
        <CardHeader title={t.settings.interface} icon={Languages} />
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-fg-2">{t.language.label}</span>
            <Segmented label={t.language.label} value={language} options={languages} onChange={(v) => set({ language: v })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-fg-2">{t.theme.label}</span>
            <Segmented<Theme> label={t.theme.label} value={theme} options={[{ value: "dark", label: t.theme.dark }, { value: "light", label: t.theme.light }]} onChange={(v) => set({ theme: v })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-fg-2">{t.settings.research}</div>
              <div className="text-xs text-muted">{t.settings.researchNote}</div>
            </div>
            <Segmented label={t.settings.research} value={researchLanguage} options={languages} onChange={(v) => set({ researchLanguage: v })} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.settings.engine} icon={Server} />
        <div className="p-4 sm:p-5">
          <p className="mb-4 text-xs text-muted">{t.settings.engineNote}</p>
          {statusError && <p className="text-sm text-bad">{t.errors.network}</p>}
          {!status && !statusError && <p className="text-sm text-muted">{t.common.loading}</p>}
          {status && (
            <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
              {status.demoMode && <p className="text-warn sm:col-span-2">{t.settings.demo}</p>}
              <dt className="text-muted">{t.settings.ai}</dt>
              <dd>{status.ai ? <Badge tone="ok">{`${status.ai.provider} · ${status.ai.model}`}</Badge> : <Badge>{t.settings.notConfigured}</Badge>}</dd>
              <dt className="text-muted">{t.settings.search}</dt>
              <dd className="flex flex-wrap gap-1.5">{status.search.length ? status.search.map((s) => <Badge key={s} tone="ok">{s}</Badge>) : <Badge>{t.settings.notConfigured}</Badge>}</dd>
              <dt className="text-muted">{t.settings.database}</dt>
              <dd><Badge tone={status.database === "supabase" ? "ok" : "neutral"}>{status.database === "supabase" ? "Supabase" : t.settings.local}</Badge></dd>
            </dl>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.settings.account} icon={UserRound} />
        <div className="space-y-3 p-4 sm:p-5 text-sm">
          {!configured ? (
            <p className="text-fg-2">{t.auth.notConfigured}</p>
          ) : user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-fg-2">{t.auth.signedInAs(user.email ?? "")}</span>
              <button type="button" onClick={() => void signOut()} className={buttonClass.secondary}>
                <LogOut size={15} aria-hidden /> {t.profile.signOut}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-fg-2">{t.auth.intro}</span>
              <Link href="/login" className={buttonClass.primary}>{t.profile.signIn}</Link>
            </div>
          )}
          {user && localCount > 0 && (
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <p className="text-fg-2">{t.settings.localCount(localCount)}</p>
              <p className="mt-1 text-xs text-muted">{t.settings.importNote}</p>
              <button
                type="button"
                disabled={importing}
                className={`${buttonClass.secondary} mt-3`}
                onClick={async () => {
                  setImporting(true);
                  const result = await importLocalToAccount().catch(() => ({ imported: 0, skipped: 0, failed: localCount }));
                  setImportResult(t.settings.imported(result.imported, result.skipped, result.failed));
                  setImporting(false);
                }}
              >
                <UploadCloud size={15} aria-hidden /> {importing ? t.settings.importing : t.settings.import}
              </button>
              {importResult && <p role="status" className="mt-2 text-xs text-ok">{importResult}</p>}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.settings.data} icon={Database} />
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <p className="w-full text-sm text-fg-2">{t.settings.localCount(localCount)}</p>
          <button
            type="button"
            disabled={localCount === 0}
            className={buttonClass.danger}
            onClick={() => {
              if (window.confirm(t.settings.confirmClear)) {
                clearLocal();
                setLocalCount(0);
                setCleared(true);
              }
            }}
          >
            <Trash2 size={15} aria-hidden /> {t.settings.clear}
          </button>
          {cleared && <span role="status" className="text-sm text-ok">{t.settings.cleared}</span>}
        </div>
      </Card>
    </div>
  );
}
