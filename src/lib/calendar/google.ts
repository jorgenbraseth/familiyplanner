import "server-only";
import { JWT } from "google-auth-library";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { t } from "../i18n";
import {
  assembleEvents,
  distinctCalendarIds,
  googleEventsResponseSchema,
  type CalendarEvent,
  type CalendarFetch,
} from "./events";

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

export type MemberCalendar = { memberId: string; calendarIds: readonly string[] };
export type CalendarResult = { events: CalendarEvent[]; failedMemberIds: string[] };

/**
 * Events for each member's calendars between two instants. Each distinct calendar is fetched once (a calendar
 * shared by two kids gives both the event), a failing calendar doesn't fail the rest, and a member whose calendar
 * failed is in `failedMemberIds` (their other calendars' events are still returned).
 */
export async function getEvents(members: MemberCalendar[], from: Date, to: Date): Promise<CalendarResult> {
  const ids = distinctCalendarIds(members);
  const results = await Promise.allSettled(ids.map((id) => cachedEvents(id, from.toISOString(), to.toISOString())));

  const fetched = new Map<string, CalendarFetch>();
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      fetched.set(ids[i], { ok: true, items: result.value });
    } else {
      // Don't log the calendar id: it can contain personal data.
      console.error(`Calendar ${i + 1} of ${ids.length} failed:`, result.reason instanceof Error ? result.reason.message : "unknown error");
      fetched.set(ids[i], { ok: false });
    }
  });
  return assembleEvents(members, fetched, t.calendar.untitled);
}
