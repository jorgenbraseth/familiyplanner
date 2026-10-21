import { AssistantButton } from "@/components/assistant-button";
import { NavLink } from "@/components/nav-link";
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
        <header className="border-b-2 border-line bg-surface/95 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-1 px-3 py-1.5">
            <NavLink href="/">{t.nav.today}</NavLink>
            {viewing.role === "child" && (
              <>
                <NavLink href="/lekser">{t.school.navHomework}</NavLink>
                <NavLink href="/ukeplan">{t.school.navWeekPlan}</NavLink>
              </>
            )}
            <NavLink href="/family">{t.nav.family}</NavLink>
            <NavLink href="/stars" badge={pending}>
              {t.stars.nav}
            </NavLink>
            {isParent && (
              <>
                <NavLink href="/documents">{t.documents.nav}</NavLink>
                <NavLink href="/members">{t.nav.members}</NavLink>
                <NavLink href="/preview">{t.preview.nav}</NavLink>
              </>
            )}
            <form action={signOut} className="ml-auto">
              <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-chip">
                {t.nav.signOut}
              </button>
            </form>
          </nav>
        </header>
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-28">{children}</main>
      {/* The assistant answers as the signed-in member, so it is not part of a "Se som barn" preview. */}
      {!previewing && <AssistantButton locale={me.locale} />}
    </>
  );
}
