"use client";

import { useActionState, useRef } from "react";
import { t } from "@/lib/i18n";
import { LOCALES, type Member } from "@/lib/members";
import { saveMember, type SaveMemberState } from "./actions";

const initial: SaveMemberState = { ok: false };

const input =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700";
const label = "block space-y-1 text-sm font-medium";

export function MemberForm({ member }: { member?: Member }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: SaveMemberState, formData: FormData) => {
      const result = await saveMember(prev, formData);
      if (result.ok && !member) formRef.current?.reset();
      return result;
    },
    initial,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {member && <input type="hidden" name="id" value={member.id} />}
      <label className={label}>
        <span>{t.members.fields.name}</span>
        <input type="text" name="name" required maxLength={60} defaultValue={member?.name ?? ""} className={input} />
      </label>
      <label className={label}>
        <span>{t.members.fields.email}</span>
        <input
          type="email"
          name="email"
          required
          autoCapitalize="none"
          defaultValue={member?.email ?? ""}
          className={input}
        />
      </label>
      <label className={label}>
        <span>{t.members.fields.role}</span>
        <select name="role" defaultValue={member?.role ?? "child"} className={input}>
          <option value="parent">{t.members.roles.parent}</option>
          <option value="child">{t.members.roles.child}</option>
        </select>
      </label>
      <label className={label}>
        <span>{t.members.fields.calendarId}</span>
        <input
          type="text"
          name="calendar_id"
          maxLength={200}
          autoCapitalize="none"
          defaultValue={member?.calendar_id ?? ""}
          className={input}
        />
        <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {t.members.fields.calendarIdHelp}
        </span>
      </label>
      <label className={label}>
        <span>{t.members.fields.colour}</span>
        <input
          type="color"
          name="colour"
          defaultValue={member?.colour ?? "#2563eb"}
          className="block h-11 w-20 rounded-lg border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
        />
      </label>
      <label className={label}>
        <span>{t.members.fields.locale}</span>
        <select name="locale" defaultValue={member?.locale ?? "nb-NO"} className={input}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t.members.locales[l]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {member ? t.members.save : t.members.add}
        </button>
        {!pending && state.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {state.error}
          </p>
        )}
        {!pending && state.ok && (
          <p role="status" className="text-sm text-green-700 dark:text-green-300">
            {t.members.saved}
          </p>
        )}
      </div>
    </form>
  );
}
