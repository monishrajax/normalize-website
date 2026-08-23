const CATEGORIES = [
  { key: "all", label: "All", n: "01" },
  { key: "bags", label: "Bags", n: "02" },
  { key: "apparel", label: "Apparel", n: "03" },
  { key: "caps", label: "Caps", n: "04" },
  { key: "accessories", label: "Accessories", n: "05" },
];

export default function MobileMenu({ open, onClose, onCategoryChange }) {
  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[120] bg-cream transition-all duration-500 ease-(--ease-luxe)
                  ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <button onClick={onClose} aria-label="Close menu"
              className="absolute top-5 right-6 text-3xl leading-none text-ink transition-opacity hover:opacity-60">
        &times;
      </button>

      <nav className="flex h-full flex-col justify-center gap-2 px-10">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.key}
            onClick={() => { onCategoryChange(c.key); onClose(); }}
            style={{ transitionDelay: open ? `${120 + i * 60}ms` : "0ms" }}
            className={`flex items-baseline gap-5 py-2 text-left font-display text-4xl text-ink
                        transition-all duration-700 ease-(--ease-out) hover:text-gold-dark
                        ${open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
          >
            <em className="font-mono text-xs not-italic text-muted">{c.n}</em>
            {c.label}
          </button>
        ))}
      </nav>

      <p className="absolute bottom-10 left-10 text-[11px] tracking-[0.16em] text-muted uppercase">
        Everything else is noise.
      </p>
    </div>
  );
}
