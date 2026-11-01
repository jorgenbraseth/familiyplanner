import { cookies } from "next/headers";
import { signInWithGoogle } from "@/app/auth/actions";
import { t } from "@/lib/i18n";
import { loginErrorText, parseDeviceId, parseLoginError, SCREEN_DEVICE_COOKIE } from "@/lib/screen-mode";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorKey = parseLoginError(error);

  // A tablet that was set up as a family screen only offers the screen sign-in.
  const deviceId = parseDeviceId((await cookies()).get(SCREEN_DEVICE_COOKIE)?.value);
  let locked = false;
  if (deviceId) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("screen_device_locked", { p_id: deviceId });
    locked = data === true;
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-extrabold">{t.login.title}</h1>
        <p className="text-muted">{locked ? t.login.lockedDevice : t.login.intro}</p>
      </div>
      {errorKey && (
        <p className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-on-danger-soft">{loginErrorText(errorKey)}</p>
      )}
      {!locked && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="mode" value="normal" />
          <button type="submit" className="btn btn-primary min-h-12 w-full text-base">
            {t.login.button}
          </button>
        </form>
      )}
      <form action={signInWithGoogle} className="space-y-2">
        <input type="hidden" name="mode" value="screen" />
        <button type="submit" className={`${locked ? "btn btn-primary" : "btn btn-text"} min-h-12 w-full text-base`}>
          {t.login.screenButton}
        </button>
        {!locked && <p className="text-sm text-muted">{t.login.screenHint}</p>}
      </form>
    </main>
  );
}
