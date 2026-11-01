/**
 * True only in the local mock stack (`npm run mock`, docs/MOCK.md): pages then use made-up data for what is
 * external at render time (Google Calendar). Never true on Vercel production, even if the variable leaks there.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "1" && process.env.VERCEL_ENV !== "production";
}
