/** A rounded star (decorative: the surrounding element carries the label). Colours come from theme tokens. */
export function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        d="M12 3.4c.5 0 .9.3 1.2.8l1.8 3.7c.2.4.6.7 1 .7l4.1.6c1 .1 1.4 1.4.7 2.1l-3 2.9c-.3.3-.4.7-.4 1.1l.7 4.1c.2 1-.9 1.8-1.8 1.3l-3.7-1.9c-.4-.2-.8-.2-1.2 0l-3.7 1.9c-.9.5-2-.3-1.8-1.3l.7-4.1c.1-.4-.1-.8-.4-1.1l-3-2.9c-.7-.7-.3-2 .7-2.1l4.1-.6c.4-.1.8-.3 1-.7l1.8-3.7c.3-.5.7-.8 1.2-.8z"
        className={filled ? "fill-accent stroke-star-line" : "fill-star-empty stroke-star-empty-line"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
