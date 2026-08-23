import { useState } from "react";
import Coin from "./Coin";
import { useToast } from "../context/ToastContext";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdenedzo";

const LINKS = [
  { heading: "Customer care", items: [
    ["shipping", "Shipping & Returns"],
    ["sizeguide", "Size Guide"],
    ["track", "Track Order"],
    ["contact", "Contact"],
  ]},
  { heading: "The house", items: [
    ["story", "Our Story"],
    ["craft", "Craft"],
    ["careers", "Careers"],
  ]},
];

export default function Footer({ onOpenInfo }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function subscribe(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), _subject: "Normalize — newsletter signup" }),
      });
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      setEmail("");
      showToast("Thanks — you're on the list.");
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <footer className="border-t border-line bg-cream-dark/30 pt-16 pb-8">
      <div className="mx-auto max-w-(--container-site) px-6 md:px-8">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Coin size="md" />
            <p className="metallic-text mt-4 font-brand text-base font-extrabold tracking-[0.2em]">
              NORMALIZE
            </p>
            <p className="mt-3 text-[11px] leading-relaxed tracking-wide text-muted">
              In Normalize We Trust.
              <br />
              Everything else is noise.
            </p>
          </div>

          {LINKS.map((col) => (
            <div key={col.heading}>
              <h3 className="mb-4 text-[11px] tracking-[0.18em] text-ink uppercase">{col.heading}</h3>
              <ul className="space-y-2.5">
                {col.items.map(([key, label]) => (
                  <li key={key}>
                    <button onClick={() => onOpenInfo(key)}
                            className="text-[11px] tracking-wide text-muted transition-colors hover:text-ink">
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div>
            <h3 className="mb-4 text-[11px] tracking-[0.18em] text-ink uppercase">Newsletter</h3>
            <p className="mb-4 text-[11px] leading-relaxed text-muted">
              Occasional letters. No noise.
            </p>
            <form onSubmit={subscribe} className="flex flex-col gap-2">
              <label className="sr-only" htmlFor="newsletter-email">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                className="border border-line bg-transparent px-3 py-2.5 text-xs text-ink
                           focus:border-gold-dark focus:outline-none"
              />
              <button type="submit" disabled={busy}
                      className="bg-ink px-6 py-2.5 text-[10px] tracking-[0.16em] text-cream uppercase
                                 transition-opacity hover:opacity-85 disabled:opacity-40">
                {busy ? "…" : "Subscribe"}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="text-[10px] tracking-[0.14em] text-muted uppercase">
            © {new Date().getFullYear()} Normalize · Made in India
          </p>
          <p className="text-[10px] tracking-[0.14em] text-muted uppercase">
            Payments secured by Razorpay
          </p>
        </div>
      </div>
    </footer>
  );
}
