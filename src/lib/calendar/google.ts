import "server-only";
import { JWT } from "google-auth-library";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { t } from "../i18n";
import { googleEventsResponseSchema, normalizeGoogleEvent, type CalendarEvent } from "./events";

// Reads members' calendars with the service account they shared them with (docs/SETUP.md 3B).

const serviceAccountSchema = z.object({ client_email: z.string(), private_key: z.string() });

let jwt: JWT | null | undefined;

function serviceAccount(): JWT | null {
  if (jwt !== undefined) return jwt;
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  jwt = null;
  if (!encoded) return jwt;
  try {
    const key = serviceAccountSchema.parse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
    jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY is not a base64-encoded service account JSON key");
  }
  return jwt;
}

const MAX_PAGES = 5;

async function fetchEvents(calendarId: string, timeMin: string, timeMax: string): Promise<unknown[]> {
  const client = serviceAccount();
  if (!client) throw new Error("Google service account is not configured");
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("No access token from Google");

  const items: unknown[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) {
      // Don't log the calendar id or body: they can contain personal data.
      throw new Error(`Google Calendar responded ${response.status}`);
    }
    const body = googleEventsResponseSchema.parse(await response.json());
    items.push(...body.items);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

// Cached ~5 minutes per calendar and range. Errors aren't cached (they throw).
const cachedEvents = unstable_cache(fetchEvents, ["google-calendar-events"], { revalidate: 300 });

export type MemberCalendar = { memberId: string; calendarId: string | null };
export type CalendarResult = { events: CalendarEvent[]; failedMemberIds: string[] };

/** Events for each member's calendar between two instants. A failing calendar doesn't fail the rest. */
export async function getEvents(members: MemberCalendar[], from: Date, to: Date): Promise<CalendarResult> {
  const withCalendar = members.filter((m): m is { memberId: string; calendarId: string } => !!m.calendarId);
  const results = await Promise.allSettled(
    withCalendar.map((m) => cachedEvents(m.calendarId, from.toISOString(), to.toISOString())),
  );

  const events: CalendarEvent[] = [];
  const failedMemberIds: string[] = [];
  results.forEach((result, i) => {
    const { memberId } = withCalendar[i];
    if (result.status === "rejected") {
      console.error(`Calendar for member ${memberId} failed:`, result.reason instanceof Error ? result.reason.message : "unknown error");
      failedMemberIds.push(memberId);
      return;
    }
    for (const raw of result.value) {
      const event = normalizeGoogleEvent(raw, memberId, t.calendar.untitled);
      if (event) events.push(event);
    }
  });
  return { events, failedMemberIds };
}
