import { z } from "zod";
import { t } from "./i18n";

export type Role = "parent" | "child";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  calendar_id: string | null;
  colour: string;
  locale: string;
};

export const MEMBER_COLUMNS = "id, name, email, role, calendar_id, colour, locale";

export const LOCALES = ["nb-NO", "da-DK"] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const m = t.members.errors;

/** Validates the members form. Emails are lowercased; an empty calendar id is stored as null. */
export const memberInputSchema = z.object({
  name: z.string().trim().min(1, m.name).max(60, m.name),
  email: z.string().trim().toLowerCase().pipe(z.email(m.email)),
  role: z.enum(["parent", "child"], m.role),
  calendar_id: z
    .string()
    .trim()
    .max(200, m.calendarId)
    .transform((value) => (value === "" ? null : value)),
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
    calendar_id: field("calendar_id"),
    colour: field("colour"),
    locale: field("locale"),
  });
}
