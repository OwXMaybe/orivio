"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { switchBackend } from "@/lib/database/investigations-store";
import { getSupabaseClient } from "@/lib/database/supabase";

type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

type AuthContextValue = {
  /** False when Supabase env vars are missing: the app runs in local-only mode. */
  configured: boolean;
  /** True until the stored session (if any) has been checked. */
  loading: boolean;
  user: Pick<User, "id" | "email"> | null;
  client: SupabaseClient | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Maps Supabase auth errors to codes the UI can localize, without echoing raw server text. */
function authErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "invalid_credentials";
  if (m.includes("not confirmed")) return "email_not_confirmed";
  if (m.includes("already registered") || m.includes("already exists")) return "already_registered";
  if (m.includes("password")) return "weak_password";
  if (m.includes("rate") || m.includes("too many")) return "rate_limited";
  return "auth_failed";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) {
      void switchBackend({ kind: "local" });
      return;
    }
    const apply = (next: User | null) => {
      setUser(next ? { id: next.id, email: next.email } : null);
      void switchBackend(next ? { kind: "remote", client, userId: next.id } : { kind: "local" });
    };
    client.auth.getSession().then(({ data }) => {
      apply(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!client) return { ok: false, error: "not_configured" };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: authErrorCode(error.message) } : { ok: true };
  }, [client]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!client) return { ok: false, error: "not_configured" };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { ok: false, error: authErrorCode(error.message) };
    // With email confirmation enabled, Supabase returns no session until the link is clicked.
    return { ok: true, needsConfirmation: !data.session };
  }, [client]);

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
  }, [client]);

  const value = useMemo(
    () => ({ configured: Boolean(client), loading, user, client, signIn, signUp, signOut }),
    [client, loading, user, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
