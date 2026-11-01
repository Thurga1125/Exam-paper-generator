"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, useLoad } from "./client";
import { normalizeConfig, type PaperRow } from "./schemas";

type Patchable = Partial<Pick<PaperRow, "title" | "config" | "structure" | "prompt" | "resource_ids" | "past_paper_ids" | "content" | "marking_scheme" | "warnings">>;

/** Loads a paper and autosaves local edits (debounced). */
export function usePaper(id: string, debounceMs = 800) {
  const { data, setData, error, loading, reload } = useLoad<PaperRow>(`/api/papers/${id}`);
  const [saving, setSaving] = useState<"idle" | "dirty" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = useRef<Patchable>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {};
    setSaving("saving");
    try {
      await api(`/api/papers/${id}`, { method: "PATCH", json: body });
      setSaving(Object.keys(pending.current).length ? "dirty" : "idle");
      setSaveError(null);
    } catch (e) {
      pending.current = { ...body, ...pending.current };
      setSaving("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }, [id]);

  const update = useCallback(
    (patch: Patchable) => {
      setData((cur) => (cur ? { ...cur, ...patch } : cur));
      pending.current = { ...pending.current, ...patch };
      setSaving("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), debounceMs);
    },
    [flush, setData, debounceMs],
  );

  // flush on unmount / tab close
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      void flush();
    };
  }, [flush]);

  const paper = data ? { ...data, config: normalizeConfig(data.config) } : null;
  return { paper, update, flush, saving, saveError, error, loading, reload, setData };
}
