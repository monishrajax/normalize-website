import { useEffect, useRef, useState } from "react";
import Panel from "./Panel";
import { money } from "../lib/api";
import { StarIcon } from "./icons";
import { useCart } from "../context/CartContext";

const ACCORDIONS = [
  ["material", "Material"],
  ["design", "Design"],
  ["care", "Care"],
];

export default function ProductPanel({ product, onClose }) {
  const { addToBag, wishlist, toggleWishlist } = useCart();
  const imageRef = useRef(null);
  const [variant, setVariant] = useState("");
  const [open, setOpen] = useState("material");

  // Reset the chosen size when a different product is opened, otherwise an "XL"
  // picked on a shirt would carry over to a one-size cap.
  useEffect(() => {
    if (product) {
      setVariant(product.sizes?.[0] || "");
      setOpen("material");
    }
  }, [product]);

  if (!product) return null;

  const image = product.images?.[variant] || product.image;
  const wished = wishlist.includes(product.id);

  const handleAdd = () => {
    /* The artwork flies to the bag and the badge ticks over when it lands —
       no toast, and the bag does not open itself. The source rectangle is
       measured synchronously here, so closing the canvas on the next line
       cannot pull it out from under the flight. */
    addToBag(product, variant, 1, imageRef.current, image);
    onClose();
  };

  return (
    <Panel open={Boolean(product)} onClose={onClose} eyebrow={product.category} wide>
      <div className="grid gap-10 md:grid-cols-2 md:gap-16">
        <div className="bg-cream-dark">
          {image ? (
            <img ref={imageRef} src={image} alt={product.name} width="800" height="1000"
                 loading="eager" decoding="async"
                 className="w-full object-cover" />
          ) : (
            <div className="flex aspect-4/5 items-center justify-center text-[11px] tracking-[0.16em] text-muted uppercase">
              {product.category}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display text-4xl text-ink">{product.name}</h2>
          <p className="mb-6 text-lg text-ink tabular-nums">{money(product.price)}</p>
          <p className="mb-8 max-w-prose text-sm leading-relaxed text-muted">{product.desc}</p>

          {product.sizes?.length > 0 && (
            <>
              <p className="mb-3 text-[11px] tracking-[0.16em] text-muted uppercase">
                {product.category === "bags" ? "Edition" : "Size"}
              </p>
              <div className="mb-8 flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <button key={s} onClick={() => setVariant(s)} aria-pressed={variant === s}
                          className={`min-h-11 border px-5 text-[11px] tracking-[0.12em] uppercase transition-all
                                      ${variant === s
                                        ? "border-ink bg-ink text-cream"
                                        : "border-line text-muted hover:border-ink hover:text-ink"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mb-10 flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!product.isSellable}
              className="min-h-11 flex-1 bg-ink px-8 py-4 text-[11px] tracking-[0.18em] text-cream uppercase
                         transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {product.isSellable ? "Add to bag" : "Coming soon"}
            </button>
            <button
              onClick={() => toggleWishlist(product.id)}
              aria-pressed={wished}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
              className="grid min-h-11 w-12 place-items-center border border-line transition-colors hover:border-ink"
            >
              <StarIcon filled={wished} className={`h-4 w-4 ${wished ? "text-gold-dark" : "text-ink"}`} />
            </button>
          </div>

          {/* Editorial accordions */}
          <div className="border-t border-line">
            {ACCORDIONS.map(([key, label]) => {
              const body = product.details?.[key];
              if (!body) return null;
              const isOpen = open === key;
              return (
                <div key={key} className="border-b border-line">
                  <button
                    onClick={() => setOpen(isOpen ? "" : key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between py-4 text-left"
                  >
                    <span className="text-[11px] tracking-[0.16em] text-ink uppercase">{label}</span>
                    <span className={`text-muted transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  {/* Animating max-height keeps the open/close smooth without
                      measuring the content on every render. */}
                  <div className={`grid transition-all duration-400 ease-(--ease-out)
                                   ${isOpen ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden">
                      <div
                        className="space-y-3 text-sm leading-relaxed text-muted [&_p]:mb-3"
                        dangerouslySetInnerHTML={{ __html: body }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}
