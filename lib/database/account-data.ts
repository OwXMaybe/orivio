"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

/** Account-only data (notes, collections). Every query is limited by RLS to the signed-in user. */

export type Note = { id: string; investigationId: string; body: string; createdAt: string; updatedAt: string };
export type Collection = { id: string; name: string; investigationIds: string[] };

export const MAX_NOTE_CHARS = 5000;
export const MAX_COLLECTION_NAME = 80;

type Loadable<T> = { data: T; loading: boolean; error: string | null; reload: () => Promise<void> };

function useLoad<T>(load: (() => Promise<T>) | null, initial: T): Loadable<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(load));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!load) return;
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload };
}

// ── Notes ─────────────────────────────────────────────────────────────────

export function useNotes(client: SupabaseClient | null, investigationId: string) {
  const load = useCallback(async (): Promise<Note[]> => {
    const { data, error } = await client!
      .from("user_notes")
      .select("id, investigation_id, body, created_at, updated_at")
      .eq("investigation_id", investigationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((n) => ({ id: n.id, investigationId: n.investigation_id, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at }));
  }, [client, investigationId]);
  return useLoad(client ? load : null, [] as Note[]);
}

export async function addNote(client: SupabaseClient, userId: string, investigationId: string, body: string): Promise<boolean> {
  const text = body.trim().slice(0, MAX_NOTE_CHARS);
  if (!text) return false;
  const { error } = await client.from("user_notes").insert({ user_id: userId, investigation_id: investigationId, body: text });
  return !error;
}

export async function updateNote(client: SupabaseClient, id: string, body: string): Promise<boolean> {
  const text = body.trim().slice(0, MAX_NOTE_CHARS);
  if (!text) return false;
  const { error } = await client.from("user_notes").update({ body: text }).eq("id", id);
  return !error;
}

export async function deleteNote(client: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await client.from("user_notes").delete().eq("id", id);
  return !error;
}

// ── Collections ───────────────────────────────────────────────────────────

export function useCollections(client: SupabaseClient | null) {
  const load = useCallback(async (): Promise<Collection[]> => {
    const { data, error } = await client!
      .from("collections")
      .select("id, name, collection_items(investigation_id)")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      investigationIds: ((c.collection_items as { investigation_id: string }[] | null) ?? []).map((i) => i.investigation_id),
    }));
  }, [client]);
  return useLoad(client ? load : null, [] as Collection[]);
}

export async function createCollection(client: SupabaseClient, userId: string, name: string): Promise<boolean> {
  const text = name.trim().slice(0, MAX_COLLECTION_NAME);
  if (!text) return false;
  const { error } = await client.from("collections").insert({ user_id: userId, name: text });
  return !error;
}

export async function deleteCollection(client: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await client.from("collections").delete().eq("id", id);
  return !error;
}

export async function setInCollection(client: SupabaseClient, collectionId: string, investigationId: string, member: boolean): Promise<boolean> {
  const { error } = member
    ? await client.from("collection_items").upsert({ collection_id: collectionId, investigation_id: investigationId })
    : await client.from("collection_items").delete().eq("collection_id", collectionId).eq("investigation_id", investigationId);
  return !error;
}

// ── Sharing ───────────────────────────────────────────────────────────────

/** 32 random bytes as base64url (43 characters): unguessable, URL-safe. */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}
