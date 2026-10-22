"use client";

import { useState, useTransition } from "react";
import { setTheme } from "@/app/(app)/profil/actions";
import { t } from "@/lib/i18n";
import { FONT_VARIABLES, THEMES, parseThemeId, type Theme, type ThemeId } from "@/lib/themes";

/** A tiny sample of a theme drawn with that theme's own colours, whatever theme the page is in. */
function ThemePreview({ theme }: { theme: Theme }) {
  const c = theme.tokens;
  const strip = (soft: string, on: string, line: string, label: string) => (
    <span
      className="block rounded-md px-2 py-0.5 text-[0.7rem] font-bold leading-snug"
      style={{ backgroundColor: soft, color: on, borderLeft: `4px solid ${line}` }}
    >
      {label}
    </span>
  );
  return (
    <span
      aria-hidden
      className="block overflow-hidden rounded-xl border-2"
      style={{ backgroundColor: c.background, borderColor: c.line }}
    >
      <span className="block h-4" style={{ backgroundColor: c.brand }} />
      <span className="flex flex-col gap-1 p-2">
        <span className="flex items-center justify-between gap-2">
          <span
            className="rounded-lg px-3 py-1 text-xs font-extrabold"
            style={{ backgroundColor: c["primary"], color: c["on-primary"], boxShadow: `0 2px 0 ${c["primary-strong"]}` }}
          >
            {t.profile.theme.previewButton}
          </span>
          <span className="text-xl leading-none" style={{ color: c.accent }}>
            ★
          </span>
        </span>
        {strip(c["school-soft"], c["on-school-soft"], c["school-line"], "Norsk")}
        {strip(c["pause-soft"], c["on-pause-soft"], c["pause-line"], "Friminutt")}
        {strip(c["event-soft"], c["on-event-soft"], c["event-line"], "Trening")}
      </span>
    </span>
  );
}

/** Switches the page to a theme at once, without waiting for the server. */
function applyTheme(id: ThemeId) {
  document.documentElement.dataset.themeName = parseThemeId(id);
}

/** The six themes as radio tiles. Choosing one applies it at once (data-theme-name on <html>) and saves it in the background. */
export function ThemePicker({ current }: { current: ThemeId }) {
  const [selected, setSelected] = useState<ThemeId>(current);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(id: ThemeId) {
    if (id === selected) return;
    const previous = selected;
    setSelected(id);
    setMessage(null);
    applyTheme(id);
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await setTheme(id)).ok;
      } catch {
        ok = false;
      }
      if (ok) {
        setMessage({ ok: true, text: t.profile.theme.saved });
      } else {
        setSelected(previous);
        applyTheme(previous);
        setMessage({ ok: false, text: t.profile.theme.failed });
      }
    });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{t.profile.theme.legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {THEMES.map((theme) => {
          const checked = theme.id === selected;
          return (
            <label key={theme.id} className="block cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={checked}
                onChange={() => choose(theme.id)}
                className="peer sr-only"
              />
              <span
                className={`block min-h-11 space-y-2 rounded-2xl border-2 bg-surface p-3 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                  checked ? "border-primary" : "border-line hover:border-muted"
                }`}
              >
                <ThemePreview theme={theme} />
                <span className="flex items-center justify-between gap-2">
                  <span
                    className="text-lg font-extrabold text-ink"
                    style={{ fontFamily: `var(${FONT_VARIABLES[theme.headFont]}), sans-serif` }}
                  >
                    {theme.name}
                  </span>
                  {checked && (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-extrabold text-on-primary">
                      <span aria-hidden>✓ </span>
                      {t.profile.theme.current}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-muted">{theme.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className={`min-h-6 text-sm font-semibold ${message?.ok === false ? "text-danger" : "text-muted"}`}>
        {pending ? t.profile.theme.saving : (message?.text ?? "")}
      </p>
    </fieldset>
  );
}
