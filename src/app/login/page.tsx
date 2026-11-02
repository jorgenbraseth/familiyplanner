import { signInWithGoogle } from "@/app/auth/actions";
import { t } from "@/lib/i18n";
import { loginErrorText, parseLoginError } from "@/lib/screen-mode";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorKey = parseLoginError(error);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-extrabold">
          {t.login.title}
        </h1>
        <p className="text-muted">{t.login.intro}</p>
      </div>
      {errorKey && (
        <p className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-on-danger-soft">
          {loginErrorText(errorKey)}
        </p>
      )}
      <form action={signInWithGoogle}>
        <input type="hidden" name="mode" value="normal" />
        <button
          type="submit"
          className="btn btn-primary min-h-12 w-full text-base"
        >
          {t.login.button}
        </button>
      </form>
      <form action={signInWithGoogle} className="space-y-2">
        <input type="hidden" name="mode" value="screen" />
        <button
          type="submit"
          className="btn btn-text min-h-12 w-full text-base"
        >
          {t.login.screenButton}
        </button>
        <p className="text-sm text-muted">{t.login.screenHint}</p>
      </form>
    </main>
  );
}
