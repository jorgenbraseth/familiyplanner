import "server-only";
import { cookies } from "next/headers";
import { isMockMode } from "./mock-mode";

/**
 * "Now" for server rendering. In the mock stack (never on Vercel production) a `mock_now` cookie with an ISO
 * date-time overrides the clock, so screenshots can show any time of day (`npm run shot -- --now <ISO>`).
 */
export async function getNow(): Promise<Date> {
  if (isMockMode()) {
    const raw = (await cookies()).get("mock_now")?.value;
    if (raw) {
      const fake = new Date(decodeURIComponent(raw));
      if (!Number.isNaN(fake.getTime())) return fake;
    }
  }
  return new Date();
}
