/** Why extraction failed. The UI maps each code to a message in src/lib/i18n.ts. */
export type ExtractionErrorCode =
  | "busy"
  | "auth"
  | "unreadable"
  | "connection"
  | "service"
  | "refused"
  | "too_large"
  | "bad_result"
  | "unexpected";

/** Extraction failed. `reason` is a short English description for logs; it never contains document content. */
export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly reason: string;

  constructor(code: ExtractionErrorCode, reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = "ExtractionError";
    this.code = code;
    this.reason = reason;
  }
}
