import { z } from "zod";
import { t } from "./i18n";

export type Role = "parent" | "child";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Google calendar ids (at most MAX_CALENDARS). Empty: no calendar connected. */
  calendar_ids: string[];
  colour: string;
  locale: string;
  /** Profile picture in the private `avatars` bucket (`<member_id>/<name>.webp`), or null. */
  avatar_path?: string | null;
};

export const MEMBER_COLUMNS = "id, name, email, role, calendar_ids, colour, locale, avatar_path";

// Every family member is Norwegian: speech and answers are always bokmål.
export const LOCALES = ["nb-NO"] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const MAX_CALENDARS = 10;
export const MAX_CALENDAR_ID_LENGTH = 200;

const m = t.members.errors;

/** Trims calendar ids, drops blanks and repeats (keeping the first of each). */
export function cleanCalendarIds(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v !== ""))];
}

/** Validates the members form. Emails are lowercased; calendar ids are trimmed, blanks and repeats dropped. */
export const memberInputSchema = z.object({
  name: z.string().trim().min(1, m.name).max(60, m.name),
  email: z.string().trim().toLowerCase().pipe(z.email(m.email)),
  role: z.enum(["parent", "child"], m.role),
  calendar_ids: z
    .array(z.string())
    .transform(cleanCalendarIds)
    .pipe(
      z
        .array(z.string().max(MAX_CALENDAR_ID_LENGTH, m.calendarId))
        .max(MAX_CALENDARS, m.calendarCount),
    ),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, m.colour),
  locale: z.enum(LOCALES, m.locale),
});

export type MemberInput = z.infer<typeof memberInputSchema>;

export function parseMemberForm(formData: FormData) {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return memberInputSchema.safeParse({
    name: field("name"),
    email: field("email"),
    role: field("role"),
    calendar_ids: formData.getAll("calendar_ids").filter((v): v is string => typeof v === "string"),
    colour: field("colour"),
    locale: field("locale"),
  });
}
