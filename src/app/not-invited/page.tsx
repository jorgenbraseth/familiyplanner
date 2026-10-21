import Link from "next/link";
import { t } from "@/lib/i18n";

export default async function NotInvitedPage({ searchParams }: PageProps<"/not-invited">) {
  const { email } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-3xl font-extrabold">{t.notInvited.title}</h1>
      <p className="text-muted">{t.notInvited.body(typeof email === "string" ? email : null)}</p>
      <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-primary-strong underline-offset-4 hover:underline">
        {t.notInvited.tryAgain}
      </Link>
    </main>
  );
}
