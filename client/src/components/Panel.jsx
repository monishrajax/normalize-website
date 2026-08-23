import { useEffect } from "react";

/* The full-page editorial canvases the original used instead of drawers.
   Shared so search, cart and wishlist behave identically: escape closes them,
   and the page behind them can't scroll while one is open. */
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
      className={`fixed inset-0 z-[130] overflow-y-auto bg-cream transition-all duration-500 ease-(--ease-luxe)
                  ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed top-5 right-6 z-10 text-3xl leading-none text-ink transition-opacity hover:opacity-60"
      >
        &times;
      </button>

      <div className={`mx-auto px-6 py-20 md:px-8 ${wide ? "max-w-(--container-site)" : "max-w-3xl"}`}>
        {eyebrow && (
          <p className="mb-8 text-[11px] tracking-[0.2em] text-muted uppercase">{eyebrow}</p>
        )}
        {children}
      </div>
    </div>
  );
}
