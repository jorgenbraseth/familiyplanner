"use client";

import { useActionState, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { LOCALES, MAX_CALENDARS, MAX_CALENDAR_ID_LENGTH, type Member } from "@/lib/members";
import { saveMember, type SaveMemberState } from "./actions";

const initial: SaveMemberState = { ok: false };

/** Suggested member colours (Kalenderblad); any other stored colour stays valid, the picker still allows free choice. */
const COLOUR_CHOICES = ["#6bb33a", "#29a3f0", "#f5b41c", "#9d6bf0", "#f7801f", "#e5484d"];

const input =
  "field";
const label = "block space-y-1 text-sm font-bold";

export function MemberForm({ member }: { member?: Member }) {
  const formRef = useRef<HTMLFormElement>(null);
  const colourRef = useRef<HTMLInputElement>(null);
  const [resetCount, setResetCount] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: SaveMemberState, formData: FormData) => {
      const result = await saveMember(prev, formData);
      if (result.ok && !member) {
        formRef.current?.reset();
        setResetCount((n) => n + 1);
      }
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
      <CalendarFields key={`${resetCount}:${member?.calendar_ids.join("\n") ?? "new"}`} initial={member?.calendar_ids ?? []} />
      <div className={label}>
        <label className="block space-y-1">
          <span>{t.members.fields.colour}</span>
          <input
            ref={colourRef}
            type="color"
            name="colour"
            defaultValue={member?.colour ?? COLOUR_CHOICES[1]}
            className="block h-11 w-20 rounded-xl border-2 border-line bg-surface p-1"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOUR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                if (colourRef.current) colourRef.current.value = c;
              }}
              className="size-9 rounded-full border-2 border-line"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
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

let nextRowId = 0;

/** One text input per calendar id (all named `calendar_ids`), with a remove button each and an add button. */
function CalendarFields({ initial }: { initial: string[] }) {
  const [rows, setRows] = useState(() =>
    (initial.length > 0 ? initial : [""]).map((value) => ({ key: nextRowId++, value })),
  );
  const update = (key: number, value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  const remove = (key: number) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length > 0 ? next : [{ key: nextRowId++, value: "" }];
    });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold">{t.members.fields.calendars}</legend>
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            type="text"
            name="calendar_ids"
            maxLength={MAX_CALENDAR_ID_LENGTH}
            autoCapitalize="none"
            aria-label={`${t.members.fields.calendarId} ${i + 1}`}
            value={row.value}
            onChange={(e) => update(row.key, e.target.value)}
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => remove(row.key)}
            aria-label={t.members.fields.calendarRemove(i + 1)}
            className="btn btn-secondary flex size-11 shrink-0 items-center justify-center"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      ))}
      {rows.length < MAX_CALENDARS && (
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { key: nextRowId++, value: "" }])}
          className="btn btn-secondary"
        >
          {t.members.fields.calendarAdd}
        </button>
      )}
      <p className="text-xs font-normal text-muted">{t.members.fields.calendarIdHelp}</p>
    </fieldset>
  );
}
