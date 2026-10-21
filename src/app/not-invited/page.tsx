import Link from "next/link";
import { t } from "@/lib/i18n";

export default async function NotInvitedPage({ searchParams }: PageProps<"/not-invited">) {
  const { email } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t.notInvited.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t.notInvited.body(typeof email === "string" ? email : null)}</p>
      <Link href="/login" className="font-medium text-blue-600 hover:underline">
        {t.notInvited.tryAgain}
      </Link>
    </main>
  );
}
