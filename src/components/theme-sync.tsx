"use client";

import { useLayoutEffect } from "react";
import { DEFAULT_THEME, THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS, parseThemeId, type ThemeId } from "@/lib/themes";

function readCookie(): string | undefined {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${THEME_COOKIE}=`));
  return match?.slice(THEME_COOKIE.length + 1);
}

/**
 * Makes `<html data-theme-name>` match the member's stored theme. The root layout picks the theme from the cookie,
 * which a new device does not have yet: this sets the attribute at once (no reload) and writes the cookie so that
 * later page loads are right from the first paint. In a "Se som barn" preview it shows the child's theme without
 * touching the parent's cookie, and puts the parent's theme back when the preview ends. No refresh, so no loops.
 */
export function ThemeSync({ theme, preview }: { theme: ThemeId; preview: boolean }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = parseThemeId(root.dataset.themeName ?? DEFAULT_THEME);
    root.dataset.themeName = theme;
    if (preview) {
      return () => {
        root.dataset.themeName = previous;
      };
    }
    if (readCookie() !== theme) {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    }
  }, [theme, preview]);
  return null;
}
