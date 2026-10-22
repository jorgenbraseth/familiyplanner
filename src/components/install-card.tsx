"use client";

import { useEffect, useState } from "react";
import { useInstall } from "@/lib/use-install";
import { t } from "@/lib/i18n";

const DISMISS_KEY = "install-card-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Installer appen" card: Chrome's install prompt on Android, short instructions on iPhone. Hidden once installed. */
export function InstallCard() {
  const { state, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // The stored choice needs the browser, so it is read after mount (hidden until then).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
    setDismissed(true);
  }

  async function install() {
    await promptInstall();
    // The prompt event is used up either way; the card goes.
    setDismissed(true);
  }

  const mode = state === "promptable" ? "prompt" : state === "ios" ? "ios" : "hidden";
  if (dismissed || mode === "hidden") return null;
  return (
    <section className="space-y-2 rounded-3xl bg-chip p-5">
      <h2 className="text-2xl font-bold">{t.install.title}</h2>
      <p className="text-sm text-muted">{mode === "ios" ? t.install.iosSteps : t.install.description}</p>
      <div className="flex flex-wrap gap-2">
        {mode === "prompt" && (
          <button type="button" onClick={install} className="btn btn-primary min-h-11">
            {t.install.button}
          </button>
        )}
        <button type="button" onClick={dismiss} className="btn btn-secondary min-h-11">
          {t.install.dismiss}
        </button>
      </div>
    </section>
  );
}
