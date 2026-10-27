"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Language } from "@/types/investigation";
import { buttonClass, cn } from "../ui/primitives";

export const MIN_INPUT = 8;
export const MAX_INPUT = 4000;

type Props = {
  onSubmit: (input: string, researchLanguage: Language) => void;
  busy?: boolean;
  initialValue?: string;
  large?: boolean;
};

export function InvestigationForm({ onSubmit, busy = false, initialValue = "", large = false }: Props) {
  const { t, researchLanguage, set } = usePreferences();
  const [value, setValue] = useState(initialValue);
  const id = useId();
  const valid = value.trim().length >= MIN_INPUT;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onSubmit(value.trim(), researchLanguage);
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">{t.form.label}</label>
      <textarea
        id={`${id}-input`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
        }}
        rows={large ? 5 : 4}
        maxLength={MAX_INPUT}
        placeholder={t.form.placeholder}
        className={cn(
          "w-full resize-y rounded-xl border border-line-strong bg-bg-2 p-4 leading-6 text-fg outline-none transition placeholder:text-muted focus:border-accent",
          large ? "text-base" : "text-sm",
        )}
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
        <span>{t.form.hint}</span>
        <span className="shrink-0 font-mono">{value.length}/{MAX_INPUT}</span>
      </div>
      <div className="mt-3 flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            {t.form.researchLanguage}
            <select
              value={researchLanguage}
              onChange={(e) => set({ researchLanguage: e.target.value as Language })}
              className="rounded-md border border-line-strong bg-bg-2 px-2 py-1.5 text-xs text-fg"
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="submit" disabled={!valid || busy} className={buttonClass.primary}>
            {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : null}
            {busy ? t.form.running : t.form.start}
            {!busy && <ArrowRight size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </form>
  );
}
