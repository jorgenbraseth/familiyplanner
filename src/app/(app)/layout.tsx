import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentMember } from "@/lib/auth";
import { t } from "@/lib/i18n";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await getCurrentMember();
  const link = "rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-background/95 backdrop-blur dark:border-zinc-800">
        <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-1 px-3 py-2">
          <Link href="/" className={link}>
            {t.nav.today}
          </Link>
          <Link href="/family" className={link}>
            {t.nav.family}
          </Link>
          {member.role === "parent" && (
            <>
              <Link href="/documents" className={link}>
                {t.documents.nav}
              </Link>
              <Link href="/members" className={link}>
                {t.nav.members}
              </Link>
            </>
          )}
          <form action={signOut} className="ml-auto">
            <button type="submit" className={`${link} text-zinc-500 dark:text-zinc-400`}>
              {t.nav.signOut}
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4">{children}</main>
    </>
  );
}
