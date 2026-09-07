import { useEffect, useRef, useState } from "react";
import Panel from "./Panel";
import { api, money } from "../lib/api";

export default function SearchPanel({ open, onClose, onSelect }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
    else { setTerm(""); setResults([]); }
  }, [open]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }

    setSearching(true);
    // Debounced so typing "butterfly" is one request, not nine. The abort
    // controller drops a slow earlier response that would otherwise land after
    // a newer one and overwrite it.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { products } = await api.getProducts({ q });
        if (!controller.signal.aborted) setResults(products);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);

    return () => { controller.abort(); clearTimeout(timer); };
  }, [term]);

  return (
    <Panel open={open} onClose={onClose} eyebrow="Search">
      <input
        ref={inputRef}
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="What are you looking for?"
        autoComplete="off"
        className="field pb-4 font-display text-3xl md:text-4xl"
      />

      <div className="mt-10 space-y-1">
        {searching && <p className="text-sm text-muted">Searching…</p>}

        {!searching && term.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted">Nothing matches “{term.trim()}”.</p>
        )}

        {results.map((p) => (
          <button
            key={p.id}
            onClick={() => { onSelect(p); onClose(); }}
            className="flex w-full items-center gap-4 border-b border-line/60 py-3 text-left
                       transition-colors hover:bg-cream-dark/40"
          >
            <div className="h-16 w-14 shrink-0 overflow-hidden bg-cream-dark">
              {p.image && (
                <img src={p.image} alt="" loading="lazy" decoding="async"
                     className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs tracking-[0.08em] text-ink uppercase">{p.name}</p>
              <p className="text-[11px] text-muted uppercase">{p.category}</p>
            </div>
            <p className="shrink-0 text-xs text-muted tabular-nums">{money(p.price)}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}
