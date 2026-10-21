import { PushToggle } from "@/components/push-toggle";
import { t } from "@/lib/i18n";

/** "Varsler" card for the Meg page. */
export function PushCard() {
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-(--card-shadow)">
      <h2 className="text-xl font-extrabold">{t.push.title}</h2>
      <PushToggle />
    </section>
  );
}
