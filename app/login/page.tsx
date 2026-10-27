"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, PageHeader, buttonClass, inputClass } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";

const MIN_PASSWORD = 8;

export default function LoginPage() {
  const { t } = usePreferences();
  const { configured, loading, user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  if (!configured) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title={t.auth.title} />
        <Card className="p-5 text-sm text-fg-2">{t.auth.notConfigured}</Card>
      </div>
    );
  }
  if (loading) return <p className="text-sm text-muted">{t.common.loading}</p>;
  if (user) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title={t.auth.title} />
        <Card className="space-y-4 p-5">
          <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 size={16} aria-hidden /> {t.auth.signedInAs(user.email ?? "")}</p>
          <Link href="/dashboard" className={buttonClass.primary}>{t.auth.goDashboard}</Link>
        </Card>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "signUp" && password.length < MIN_PASSWORD) {
      setError("weak_password");
      return;
    }
    setBusy(true);
    const result = mode === "signIn" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else if (result.needsConfirmation) setConfirmSent(true);
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t.auth.title} intro={t.auth.intro} />
      <Card className="p-5">
        {confirmSent ? (
          <p role="status" className="flex gap-2 text-sm leading-6 text-fg-2">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" aria-hidden /> {t.auth.confirmSent}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <LockKeyhole size={17} className="text-accent" aria-hidden />
              {mode === "signIn" ? t.auth.signIn : t.auth.signUp}
            </h2>
            <label className="block text-sm text-fg-2">
              {t.auth.email}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm text-fg-2">
              {t.auth.password}
              <input
                type="password"
                required
                minLength={mode === "signUp" ? MIN_PASSWORD : undefined}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} mt-1`}
              />
              {mode === "signUp" && <span className="mt-1 block text-xs text-muted">{t.auth.passwordHint}</span>}
            </label>
            {error && (
              <p role="alert" className="flex gap-1.5 text-sm text-bad">
                <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> {t.auth.errors[error] ?? t.auth.errors.auth_failed}
              </p>
            )}
            <button type="submit" disabled={busy} className={`${buttonClass.primary} w-full`}>
              {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
              {mode === "signIn" ? t.auth.signIn : t.auth.signUp}
            </button>
            <p className="text-center text-xs text-muted">
              {mode === "signIn" ? t.auth.noAccount : t.auth.haveAccount}{" "}
              <button type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(null); }} className="text-accent hover:underline">
                {mode === "signIn" ? t.auth.signUp : t.auth.signIn}
              </button>
            </p>
          </form>
        )}
        <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">{t.auth.privacy}</p>
      </Card>
    </div>
  );
}
