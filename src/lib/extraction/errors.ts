/** Extraction failed. `reason` is short and never contains document content. */
export class ExtractionError extends Error {
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = "ExtractionError";
    this.reason = reason;
  }
}
