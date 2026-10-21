/** A member's round profile picture, or the member's colour dot when there is none (or it can't load). */
export function MemberAvatar({
  colour,
  url,
  size = 14,
  className = "",
}: {
  colour: string;
  url?: string | null;
  /** Diameter in px; the dot fallback keeps its usual small size. */
  size?: number;
  className?: string;
}) {
  if (!url) {
    return (
      <span
        aria-hidden
        className={`shrink-0 rounded-full ${className}`}
        style={{ backgroundColor: colour, width: Math.min(size, 14), height: Math.min(size, 14) }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, already 256px
    <img
      src={url}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded-full border-2 object-cover ${className}`}
      style={{ borderColor: colour, width: size, height: size }}
    />
  );
}
