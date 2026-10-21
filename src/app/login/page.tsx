import { signInWithGoogle } from "@/app/auth/actions";
import { t } from "@/lib/i18n";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-extrabold">{t.login.title}</h1>
        <p className="text-muted">{t.login.intro}</p>
      </div>
      {error && <p className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-on-danger-soft">{t.login.failed}</p>}
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="btn btn-primary min-h-12 w-full text-base"
        >
          {t.login.button}
        </button>
      </form>
    </main>
  );
}
