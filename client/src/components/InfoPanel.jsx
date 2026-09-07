import Panel from "./Panel";
import { INFO_CONTENT } from "../data/infoContent";
import { ContactForm, TrackForm } from "./InfoForms";
import { money } from "../lib/api";

/* These two sections carried <form> markup in the original string. A form needs
   React state to work, so the stored HTML is dropped for them and a real
   component is rendered instead — everything else is static prose. */
const CUSTOM = { contact: ContactForm, track: TrackForm };

/* Fills {{shippingFee}} / {{freeShippingThreshold}} from the server's config so
   the policy text always quotes the figure checkout actually charges. */
function fillTokens(html, config) {
  if (!config) return html;
  return html
    .replaceAll("{{shippingFee}}", money(config.shippingFee))
    .replaceAll("{{freeShippingThreshold}}", money(config.freeShippingThreshold));
}

export default function InfoPanel({ section, onClose, config }) {
  const content = section ? INFO_CONTENT[section] : null;
  const Custom = section ? CUSTOM[section] : null;

  return (
    <Panel open={Boolean(content)} onClose={onClose} eyebrow={content?.eyebrow}>
      {/* The typed document chassis, shared by all six reading pages: eyebrow
          (from Panel), large title, typewriter lede, short gold rule, body
          copy. The numbered margin indices and hairline dividers come from
          .doc-list in the stylesheet. */}
      {content && (
        <article>
          <h2 className="mb-5 font-display text-4xl text-ink md:text-5xl">{content.title}</h2>

          {content.lede && (
            <p className="mb-8 max-w-prose text-sm leading-relaxed text-muted">
              {fillTokens(content.lede, config)}
            </p>
          )}

          <hr className="doc-rule" />

          {Custom ? (
            <Custom />
          ) : (
            /* Static copy authored in this repo and bundled at build time — it
               never contains anything a visitor supplied. */
            <div
              className="prose-normalize max-w-prose space-y-4 text-sm leading-relaxed text-muted
                         [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-xl [&_h3]:text-ink
                         [&_li]:mb-1 [&_strong]:text-ink [&_table]:w-full [&_table]:text-xs
                         [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_th]:py-2 [&_th]:text-left
                         [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: fillTokens(content.html, config) }}
            />
          )}
        </article>
      )}
    </Panel>
  );
}
