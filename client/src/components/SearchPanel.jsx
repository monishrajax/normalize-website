import { useEffect, useRef, useState } from "react";
import Panel from "./Panel";
import { api, money } from "../lib/api";

export default function SearchPanel({ open, onClose, onSelect }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
    else { setTerm(""); setResults([]); setFailed(false); }
  }, [open]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); setSearching(false); setFailed(false); return; }

    setSearching(true);
    setFailed(false);

    /* Debounced so typing "butterfly" is one request, not nine.

       The controller does two jobs, and the previous version did neither. Its
       signal is handed to fetch, so a superseded search is actually CANCELLED
       — before, a controller was built and then never passed, and the
       abandoned request ran to completion and was merely ignored. And `bail`
       bounds the wait: a request that never settles used to leave the panel
       reading "Searching…" with no way out but typing another character —
       observed, not theorised.

       `live` is what decides whether this effect may still write state, and it
       is deliberately NOT `controller.signal.aborted`. Keying the finally on
       the abort flag meant a request killed by its own timeout skipped
       `setSearching(false)` and stranded the spinner for good. */
    const controller = new AbortController();
    const bail = setTimeout(() => controller.abort(), 8000);
    let live = true;

    const timer = setTimeout(async () => {
      try {
        const { products } = await api.getProducts({ q }, { signal: controller.signal });
        if (live) setResults(products);
      } catch {
        /* A failed search must not render as "Nothing matches" — that tells a
           customer the thing does not exist when the truth is we could not
           look.

           Reaching here while `live` is the definition of a failure, whatever
           the error was. The one benign case — a newer search superseding this
           one — has already set `live` false in the cleanup, before aborting.
           Do NOT try to tell the two apart by the error's name: a supersede
           and the bail timeout both surface as AbortError, so keying on that
           reported "Nothing matches" for a search that had actually timed out. */
        if (!live) return;
        setResults([]);
        setFailed(true);
      } finally {
        clearTimeout(bail);
        if (live) setSearching(false);
      }
    }, 280);

    return () => { live = false; controller.abort(); clearTimeout(timer); clearTimeout(bail); };
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

        {!searching && failed && (
          <p className="text-sm text-brown">
            Search isn’t responding right now. Try again in a moment.
          </p>
        )}

        {!searching && !failed && term.trim().length >= 2 && results.length === 0 && (
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
