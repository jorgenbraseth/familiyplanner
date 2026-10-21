import { InstallCard } from "@/components/install-card";
import { PushToggle } from "@/components/push-toggle";
import { t } from "@/lib/i18n";

/** "Varsler" card (and the "Installer appen" card above it) for the start pages. */
export function PushCard() {
  return (
    <>
      <InstallCard />
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-(--card-shadow)">
        <h2 className="text-xl font-extrabold">{t.push.title}</h2>
        <PushToggle />
      </section>
    </>
  );
}
