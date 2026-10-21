import { AssistantButton } from "@/components/assistant-button";
import { TopNav, type TopNavItem } from "@/components/top-nav";
import { signOut } from "@/app/auth/actions";
import { t } from "@/lib/i18n";
import { loadPendingCount } from "@/lib/star-data";
import { getViewer } from "@/lib/view-as";
import { stopPreview } from "./preview-actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { me, viewing, previewing } = await getViewer();
  // Parents see how many star requests wait for them; a preview shows exactly the child's app.
  const isParent = me.role === "parent" && !previewing;
  const pending = isParent ? await loadPendingCount() : 0;
  const navItems: TopNavItem[] = [
    { href: "/", label: t.nav.today },
    ...(viewing.role === "child"
      ? [
          { href: "/lekser", label: t.school.navHomework },
          { href: "/ukeplan", label: t.school.navWeekPlan },
        ]
      : []),
    { href: "/family", label: t.nav.family },
    { href: "/stars", label: t.stars.nav, badge: pending },
    ...(isParent
      ? [
          { href: "/documents", label: t.documents.nav },
          { href: "/members", label: t.nav.members },
          { href: "/preview", label: t.preview.nav },
        ]
      : []),
  ];
  return (
    <>
      <div className="sticky top-0 z-10">
        {previewing && (
          <div className="border-b-2 border-accent bg-accent text-on-accent">
            <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-1.5">
              <p className="min-w-0 flex-1 text-sm font-extrabold">{t.preview.banner(viewing.name)}</p>
              <form action={stopPreview}>
                <button type="submit" className="btn btn-secondary min-h-11 border-on-accent">
                  {t.preview.stop}
                </button>
              </form>
            </div>
          </div>
        )}
        <header className="relative bg-brand text-on-brand">
          <TopNav items={navItems} signOutAction={signOut} />
        </header>
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-28">{children}</main>
      {/* The assistant answers as the signed-in member, so it is not part of a "Se som barn" preview. */}
      {!previewing && <AssistantButton />}
    </>
  );
}
