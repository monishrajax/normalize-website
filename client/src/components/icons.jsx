/* Shared icon geometry.

   The wishlist mark lives here rather than being pasted into the three places
   that draw it — the header, the product card and the product panel. Three
   copies of a path is three chances for them to drift apart the next time the
   mark changes, which is exactly what happened when it was a heart. */

export const STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/**
 * The wishlist star. `filled` swaps the solid state used when an item is saved.
 */
export function StarIcon({ filled = false, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={STAR_PATH} />
    </svg>
  );
}
