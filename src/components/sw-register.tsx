"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/login", "/not-invited", "/auth"];
let persistAsked = false;

/** Registers the service worker (needed for push and for installing the app). */
export function SwRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Push just won't work; the app does.
    });
  }, []);

  // Once signed in, ask the browser to keep the app's data from being evicted. Quiet: no UI either way.
  useEffect(() => {
    if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
    if (persistAsked) return;
    persistAsked = true;
    try {
      void navigator.storage?.persist?.().catch(() => {});
    } catch {
      // Not supported.
    }
  }, [pathname]);

  return null;
}
