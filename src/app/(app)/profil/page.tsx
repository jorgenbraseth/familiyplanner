import { redirect } from "next/navigation";
import { AvatarEditor } from "@/components/avatar-editor";
import { PushCard } from "@/components/push-card";
import { ThemePicker } from "@/components/theme-picker";
import { loadAvatarUrls } from "@/lib/avatar-urls";
import { t } from "@/lib/i18n";
import { parseThemeId } from "@/lib/themes";
import { getViewer } from "@/lib/view-as";

export default async function ProfilePage() {
  const { me, previewing } = await getViewer();
  // The profile is the signed-in member's own: not part of a "Se som barn" preview.
  if (previewing) redirect("/");
  const avatars = await loadAvatarUrls([me]);

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.profile.title}</h1>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <section className="card space-y-3 p-4" aria-labelledby="profile-account-title">
            <h2 id="profile-account-title" className="text-xl font-extrabold">{t.profile.account}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">{t.profile.name}</dt>
              <dd className="min-w-0 break-words font-bold">{me.name}</dd>
              <dt className="text-muted">{t.profile.email}</dt>
              <dd className="min-w-0 break-words font-bold">{me.email}</dd>
            </dl>
          </section>
          <section className="card space-y-2 p-4" aria-labelledby="profile-avatar-title">
            <h2 id="profile-avatar-title" className="text-xl font-extrabold">{t.avatar.mine}</h2>
            <AvatarEditor memberId={me.id} colour={me.colour} url={avatars[me.id]} hasAvatar={!!me.avatar_path} />
          </section>
          <PushCard />
        </div>
        <section className="card space-y-3 p-4" aria-labelledby="profile-theme-title">
          <h2 id="profile-theme-title" className="text-xl font-extrabold">{t.profile.theme.title}</h2>
          <p className="text-sm text-muted">{t.profile.theme.intro}</p>
          <ThemePicker current={parseThemeId(me.theme)} />
        </section>
      </div>
    </>
  );
}
