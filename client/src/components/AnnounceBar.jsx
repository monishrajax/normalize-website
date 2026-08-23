import { money } from "../lib/api";

/* Quotes the threshold the SERVER sent, so the strip and the cart total can
   never disagree the way the old site's two hardcoded copies did. */
export default function AnnounceBar({ config }) {
  const line = config
    ? `Free shipping over ${money(config.freeShippingThreshold)} · Easy 14-day returns`
    : "Easy 14-day returns";

  return (
    <div className="bg-ink py-2 text-center text-[11px] tracking-[0.18em] text-cream uppercase">
      {line}
    </div>
  );
}
