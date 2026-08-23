import { useState } from "react";
import { api } from "../lib/api";

/* Formspree handles contact mail straight from the browser — it is built for
   public use, so there is no secret to leak here. */
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdenedzo";

async function postToFormspree(payload) {
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = "Something went wrong. Please email contact@normalize.world.";
    try {
      const body = await res.json();
      if (body?.errors?.length) msg = body.errors.map((x) => x.message).join(" ");
    } catch { /* no JSON body — keep the default message */ }
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2.5 text-sm text-ink focus:border-gold-dark focus:outline-none";
const labelCls = "mb-1.5 block text-[10px] tracking-[0.14em] text-muted uppercase";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus({ text: "Sending…", kind: "" });
    try {
      await postToFormspree({ ...form, _subject: "Normalize — contact form" });
      setForm({ name: "", email: "", message: "" });
      setStatus({ text: "Thank you — we'll reply within 1–2 business days.", kind: "ok" });
    } catch (err) {
      setStatus({ text: err.message, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid gap-4 sm:grid-cols-2">
      <label>
        <span className={labelCls}>Your name</span>
        <input required value={form.name} autoComplete="name"
               onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
      </label>
      <label>
        <span className={labelCls}>Email</span>
        <input required type="email" value={form.email} autoComplete="email"
               onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
      </label>
      <label className="sm:col-span-2">
        <span className={labelCls}>Message</span>
        <textarea required rows={5} value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputCls} />
      </label>

      {status.text && (
        <p role="status"
           className={`text-xs sm:col-span-2 ${status.kind === "err" ? "text-brown" : "text-muted"}`}>
          {status.text}
        </p>
      )}

      <button type="submit" disabled={busy}
              className="justify-self-start bg-ink px-8 py-3.5 text-[11px] tracking-[0.16em] text-cream uppercase
                         transition-opacity hover:opacity-85 disabled:opacity-40 sm:col-span-2">
        {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export function TrackForm() {
  const [awb, setAwb] = useState("");
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setStatus({ text: "Looking up your shipment…", kind: "" });
    try {
      const data = await api.trackOrder(awb.trim());
      setResult(data);
      setStatus({ text: "", kind: "" });
    } catch (err) {
      setStatus({ text: err.message, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Tracking number</span>
          <input required value={awb} onChange={(e) => setAwb(e.target.value)}
                 placeholder="Tracking number (AWB)" className={inputCls} />
        </label>
        <button type="submit" disabled={busy}
                className="bg-ink px-8 py-3 text-[11px] tracking-[0.16em] text-cream uppercase
                           transition-opacity hover:opacity-85 disabled:opacity-40">
          {busy ? "Checking…" : "Track"}
        </button>
      </form>

      {status.text && (
        <p role="status" className={`mt-4 text-xs ${status.kind === "err" ? "text-brown" : "text-muted"}`}>
          {status.text}
        </p>
      )}

      {result && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-sm tracking-[0.08em] text-ink uppercase">{result.status}</p>
          {result.courier && (
            <p className="mt-1 text-xs text-muted">
              {result.courier}{result.awb ? ` · AWB ${result.awb}` : ""}
            </p>
          )}
          {result.etd && <p className="mt-1 text-xs text-muted">Expected delivery {result.etd}</p>}

          {result.scans?.length > 0 ? (
            <ol className="mt-6 space-y-4">
              {result.scans.map((s, i) => (
                <li key={i} className="border-l border-line pl-4">
                  <p className="text-xs text-ink">{s.activity}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {[s.location, s.date].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-xs text-muted">
              No scans recorded yet. Tracking usually appears within a few hours of dispatch.
            </p>
          )}
        </div>
      )}
    </>
  );
}
