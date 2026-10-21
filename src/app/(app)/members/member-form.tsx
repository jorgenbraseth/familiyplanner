"use client";

import { useActionState, useRef } from "react";
import { t } from "@/lib/i18n";
import { LOCALES, type Member } from "@/lib/members";
import { saveMember, type SaveMemberState } from "./actions";

const initial: SaveMemberState = { ok: false };

const input =
  "field";
const label = "block space-y-1 text-sm font-bold";

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
        <span className="block text-xs font-normal text-muted">
          {t.members.fields.calendarIdHelp}
        </span>
      </label>
      <label className={label}>
        <span>{t.members.fields.colour}</span>
        <input
          type="color"
          name="colour"
          defaultValue={member?.colour ?? "#2563eb"}
          className="block h-11 w-20 rounded-xl border-2 border-line bg-surface p-1"
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
          className="btn btn-primary"
        >
          {member ? t.members.save : t.members.add}
        </button>
        {!pending && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {!pending && state.ok && (
          <p role="status" className="text-sm font-bold text-primary-strong">
            {t.members.saved}
          </p>
        )}
      </div>
    </form>
  );
}
