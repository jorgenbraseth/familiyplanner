import { InstallCard } from "@/components/install-card";
import { PushToggle } from "@/components/push-toggle";
import { t } from "@/lib/i18n";

/** "Varsler" card (and the "Installer appen" card above it) for the start pages. */
export function PushCard() {
  return (
    <>
      <InstallCard />
      <section className="space-y-2 rounded-3xl bg-chip p-5">
        <h2 className="text-2xl font-bold">{t.push.title}</h2>
        <PushToggle />
      </section>
    </>
  );
}
