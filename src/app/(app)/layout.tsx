import { NavLink } from "@/components/nav-link";
import { signOut } from "@/app/auth/actions";
import { getCurrentMember } from "@/lib/auth";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await getCurrentMember();
  return (
    <>
      <header className="sticky top-0 z-10 border-b-2 border-line bg-surface/95 backdrop-blur">
        <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-1 px-3 py-1.5">
          <NavLink href="/">{t.nav.today}</NavLink>
          <NavLink href="/family">{t.nav.family}</NavLink>
          {member.role === "parent" && (
            <>
              <NavLink href="/documents">{t.documents.nav}</NavLink>
              <NavLink href="/members">{t.nav.members}</NavLink>
            </>
          )}
          <form action={signOut} className="ml-auto">
            <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted hover:bg-chip">
              {t.nav.signOut}
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4">{children}</main>
    </>
  );
}
