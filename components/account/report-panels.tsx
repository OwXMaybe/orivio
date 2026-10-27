"use client";

import { Check, Copy, FolderPlus, Link2, NotebookPen, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  addNote, createCollection, deleteNote, generateShareToken, MAX_COLLECTION_NAME, MAX_NOTE_CHARS,
  setInCollection, shareUrl, updateNote, useCollections, useNotes,
} from "@/lib/database/account-data";
import { updateInvestigation } from "@/lib/database/investigations-store";
import { formatDate } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Investigation } from "@/types/investigation";
import { useAuth } from "../auth/auth-provider";
import { Card, CardHeader, buttonClass, inputClass } from "../ui/primitives";

/** Shown instead of an account feature when no one is signed in. */
function AccountOnly() {
  const { t } = usePreferences();
  const { configured } = useAuth();
  return (
    <p className="text-xs leading-5 text-muted">
      {configured ? (
        <>{t.accountOnly} <Link href="/login" className="text-accent hover:underline">{t.profile.signIn}</Link></>
      ) : (
        t.profile.noAccounts
      )}
    </p>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p role="alert" className="text-xs text-bad">{text}</p> : null;
}

export function SharePanel({ investigation }: { investigation: Investigation }) {
  const { t } = usePreferences();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = investigation.shareToken ?? null;

  const toggle = async (enable: boolean) => {
    setBusy(true);
    setError(null);
    // On failure the store restores the stored state itself.
    if (!(await updateInvestigation(investigation.id, { shareToken: enable ? generateShareToken() : null }))) setError(t.share.failed);
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader title={t.share.title} icon={Link2} />
      <div className="space-y-3 p-4">
        {!user ? (
          <AccountOnly />
        ) : token ? (
          <>
            <p className="text-xs leading-5 text-muted">{t.share.on}</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl(token)} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 font-mono text-xs`} aria-label={t.share.title} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl(token));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={buttonClass.secondary}
                aria-label={t.share.copy}
              >
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              </button>
            </div>
            {copied && <p role="status" className="text-xs text-ok">{t.share.copied}</p>}
            <button type="button" disabled={busy} onClick={() => void toggle(false)} className={`${buttonClass.danger} w-full`}>{t.share.disable}</button>
          </>
        ) : (
          <>
            <p className="text-xs leading-5 text-muted">{t.share.off}</p>
            <button type="button" disabled={busy} onClick={() => void toggle(true)} className={`${buttonClass.secondary} w-full`}>{t.share.enable}</button>
          </>
        )}
        <ErrorLine text={error} />
      </div>
    </Card>
  );
}

export function NotesPanel({ investigationId }: { investigationId: string }) {
  const { t, language } = usePreferences();
  const { user, client } = useAuth();
  const notes = useNotes(user ? client : null, investigationId);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<boolean>) => {
    setError(null);
    if (!(await action())) setError(t.notes.failed);
    await notes.reload();
  };

  return (
    <Card>
      <CardHeader title={t.notes.title} icon={NotebookPen} />
      <div className="space-y-3 p-4">
        {!user || !client ? (
          <AccountOnly />
        ) : (
          <>
            {notes.loading ? (
              <p className="text-xs text-muted">{t.common.loading}</p>
            ) : notes.data.length === 0 ? (
              <p className="text-xs text-muted">{t.notes.empty}</p>
            ) : (
              <ul className="space-y-2">
                {notes.data.map((n) => (
                  <li key={n.id} className="rounded-lg border border-line bg-panel-2 p-3">
                    {editing?.id === n.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); void run(() => updateNote(client, n.id, editing.body)).then(() => setEditing(null)); }} className="space-y-2">
                        <textarea value={editing.body} maxLength={MAX_NOTE_CHARS} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} rows={3} className={inputClass} />
                        <div className="flex gap-2">
                          <button type="submit" className={buttonClass.secondary}>{t.notes.save}</button>
                          <button type="button" onClick={() => setEditing(null)} className={buttonClass.ghost}>{t.notes.cancel}</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap break-words text-sm text-fg-2">{n.body}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-muted">{formatDate(n.updatedAt, language, true)}</span>
                          <span className="flex gap-1">
                            <button type="button" onClick={() => setEditing({ id: n.id, body: n.body })} aria-label={t.notes.edit} className={buttonClass.ghost}><Pencil size={13} aria-hidden /></button>
                            <button type="button" onClick={() => window.confirm(t.notes.confirmDelete) && void run(() => deleteNote(client, n.id))} aria-label={t.notes.delete} className={`${buttonClass.ghost} hover:text-bad`}><Trash2 size={13} aria-hidden /></button>
                          </span>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={(e) => { e.preventDefault(); void run(() => addNote(client, user.id, investigationId, draft)).then(() => setDraft("")); }} className="space-y-2">
              <label className="sr-only" htmlFor="new-note">{t.notes.placeholder}</label>
              <textarea id="new-note" value={draft} maxLength={MAX_NOTE_CHARS} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={t.notes.placeholder} className={inputClass} />
              <button type="submit" disabled={!draft.trim()} className={`${buttonClass.secondary} w-full`}>{t.notes.add}</button>
            </form>
            <ErrorLine text={error ?? (notes.error ? t.notes.failed : null)} />
          </>
        )}
      </div>
    </Card>
  );
}

export function CollectionsPanel({ investigationId }: { investigationId: string }) {
  const { t } = usePreferences();
  const { user, client } = useAuth();
  const collections = useCollections(user ? client : null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<boolean>) => {
    setError(null);
    if (!(await action())) setError(t.collections.failed);
    await collections.reload();
  };

  return (
    <Card>
      <CardHeader title={t.collections.title} icon={FolderPlus} />
      <div className="space-y-3 p-4">
        {!user || !client ? (
          <AccountOnly />
        ) : (
          <>
            {collections.loading ? (
              <p className="text-xs text-muted">{t.common.loading}</p>
            ) : collections.data.length === 0 ? (
              <p className="text-xs text-muted">{t.collections.empty}</p>
            ) : (
              <ul className="space-y-1">
                {collections.data.map((c) => {
                  const member = c.investigationIds.includes(investigationId);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-2">
                        <input type="checkbox" checked={member} onChange={() => void run(() => setInCollection(client, c.id, investigationId, !member))} className="accent-[var(--accent)]" />
                        <span className="truncate">{c.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <form onSubmit={(e) => { e.preventDefault(); void run(() => createCollection(client, user.id, name)).then(() => setName("")); }} className="flex gap-2">
              <input value={name} maxLength={MAX_COLLECTION_NAME} onChange={(e) => setName(e.target.value)} placeholder={t.collections.newName} aria-label={t.collections.newName} className={`${inputClass} min-w-0`} />
              <button type="submit" disabled={!name.trim()} className={buttonClass.secondary}>{t.collections.create}</button>
            </form>
            <ErrorLine text={error ?? (collections.error ? t.collections.failed : null)} />
          </>
        )}
      </div>
    </Card>
  );
}
