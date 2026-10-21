import { signInWithGoogle } from "@/app/auth/actions";
import { t } from "@/lib/i18n";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{t.login.title}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t.login.intro}</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t.login.failed}</p>}
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700 active:bg-blue-800"
        >
          {t.login.button}
        </button>
      </form>
    </main>
  );
}
