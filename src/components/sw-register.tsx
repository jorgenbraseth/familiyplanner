"use client";

import { useEffect } from "react";

/** Registers the service worker (needed for push and for installing the app). */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Push just won't work; the app does.
    });
  }, []);
  return null;
}
