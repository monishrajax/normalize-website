import { useEffect } from "react";

/* Every secondary surface on the site is one of these: a full-viewport canvas
   with its own scroll, never a drawer and never a popup. Search, Products, Bag,
   Wishlist, Checkout and all six reading pages share this chassis, so escape
   closes them identically and the page behind can't scroll while one is open.

   The reveal is a liquid clip-path — see .canvas-surface in styles/index.css.
   The node stays mounted while closed (pointer-events off) because clipping
   cannot animate from an unmounted element. */
export default function Panel({ open, onClose, eyebrow, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    // Restore whatever overflow the page had rather than assuming "visible".
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={`canvas-surface fixed inset-0 z-[130] overflow-y-auto bg-cream
                  ${open ? "canvas-open pointer-events-auto" : "canvas-closed pointer-events-none"}`}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        tabIndex={open ? 0 : -1}
        /* 44px minimum touch target — the brief's floor for every control. */
        className="fixed top-3 right-3 z-10 grid h-11 w-11 place-items-center text-3xl leading-none
                   text-ink transition-opacity hover:opacity-60 md:top-5 md:right-6"
      >
        &times;
      </button>

      <div className={`canvas-body mx-auto px-6 py-20 md:px-8 ${wide ? "max-w-(--container-site)" : "max-w-3xl"}`}>
        {eyebrow && (
          <p className="mb-8 text-[11px] tracking-[0.2em] text-muted uppercase">{eyebrow}</p>
        )}
        {children}
      </div>
    </div>
  );
}
