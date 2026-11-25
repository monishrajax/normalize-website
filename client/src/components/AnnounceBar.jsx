import { money } from "../lib/api";

/* Quotes the threshold the SERVER sent, so the strip and the cart total can
   never disagree the way the old site's two hardcoded copies did. */
export default function AnnounceBar({ config }) {
  /* While the server cannot reach its database it still shows the catalogue but
     cannot take an order, and says so (`ordering: "paused"` on /api/config).
     Said once, here, in the strip every page already has — not as a toast and
     not as a popup — so nobody finds out at the checkout. */
  const line = config?.ordering === "paused"
    ? "Ordering is paused · Back shortly"
    : config
      ? `Free shipping over ${money(config.freeShippingThreshold)} · Easy 14-day returns`
      : "Easy 14-day returns";

  return (
    <div className="bg-ink py-2 text-center text-[11px] tracking-[0.18em] text-cream uppercase">
      {line}
    </div>
  );
}
