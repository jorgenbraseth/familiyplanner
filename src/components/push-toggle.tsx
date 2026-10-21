"use client";

import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/app/(app)/push-actions";
import { t } from "@/lib/i18n";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function detect(): Promise<Status> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return isIos() ? "ios-install" : "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        return sub ? "on" : "off";
      } catch {
        return "off";
      }
    }
    detect().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError(t.push.notConfigured);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = sub.toJSON();
      const result = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys });
      if (!result.ok) {
        await sub.unsubscribe();
        setError(t.push.failed);
        return;
      }
      setStatus("on");
    } catch {
      setError(t.push.failed);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError(t.push.failed);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <p className="text-sm text-muted">…</p>;
  if (status === "unsupported") return <p className="text-sm text-muted">{t.push.unsupported}</p>;
  if (status === "ios-install") return <p className="text-sm text-muted">{t.push.iosInstall}</p>;
  if (status === "denied") return <p className="text-sm text-muted">{t.push.denied}</p>;

  return (
    <div className="space-y-2">
      {status === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-semibold text-primary-strong">{t.push.on}</p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-full border border-line bg-chip px-4 py-2 text-sm font-bold text-chip-ink disabled:opacity-60"
          >
            {t.push.disable}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">{t.push.description}</p>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="rounded-full bg-primary px-5 py-2.5 font-bold text-on-primary disabled:opacity-60"
          >
            {t.push.enable}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
