/** A star picture (decorative: the surrounding element carries the label). Both images share one square canvas so they line up. */
export function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  const name = filled ? "star-filled" : "star-empty";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static artwork, fixed square, no optimisation needed
    <img
      src={`/stars/${name}.png`}
      srcSet={`/stars/${name}.png 1x, /stars/${name}@2x.png 2x`}
      width={256}
      height={256}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
    />
  );
}
