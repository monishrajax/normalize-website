/* Policy and customer-care copy, lifted verbatim from the original single-file
   site. {{shippingFee}} and {{freeShippingThreshold}} are filled in at render
   time from GET /api/config, so the policy text can never quote a different
   figure from the one the checkout actually charges. */
export const INFO_CONTENT = {
  "shipping": {
    "eyebrow": "Customer care",
    "title": "Shipping & Returns",
    "lede": "What happens between you paying and the parcel reaching your door.",
    "html": "\n      <ol class=\"doc-list\">\n        <li>\n          <h4>This is a pre-book</h4>\n          <p>Payment is taken now; your piece is dispatched as soon as the first run is finished. We email you the courier name and tracking number the day it leaves us — you never have to chase it.</p>\n        </li>\n        <li>\n          <h4>Delivery across India</h4>\n          <p>We ship through Shiprocket's courier partners. Once dispatched, metros usually take 3&ndash;5 business days and other pin codes 5&ndash;8. Flat shipping is {{shippingFee}}, free over {{freeShippingThreshold}}.</p>\n        </li>\n        <li>\n          <h4>If something is wrong</h4>\n          <p>Damaged in transit, or not what was shown here? Write to us within 14 days of delivery with a photo and your order number. We replace it or refund you in full — refunds land back on the card or UPI you paid with, within 5&ndash;7 business days of the piece reaching us.</p>\n        </li>\n        <li>\n          <h4>Sending it back</h4>\n          <p>Unused, with the tag still attached. We cover return postage whenever the fault is ours.</p>\n        </li>\n      </ol>\n      <div class=\"doc-aside\">\n        <p>Questions before you order? <a href=\"mailto:contact@normalize.world\">contact@normalize.world</a> &mdash; a person reads it.</p>\n      </div>"
  },
  "sizeguide": {
    "eyebrow": "Specification",
    "title": "Size Guide",
    "lede": "One size, two editions. Dawn and Dusk are the same bag — they differ in the handles and the lining, never the shape.",
    "html": "\n      <dl class=\"doc-spec\">\n        <div><dt>Width</dt><dd>&mdash;</dd></div>\n        <div><dt>Height</dt><dd>&mdash;</dd></div>\n        <div><dt>Base gusset</dt><dd>&mdash;</dd></div>\n        <div><dt>Handle drop</dt><dd>&mdash;</dd></div>\n        <div><dt>Material</dt><dd>Jute</dd></div>\n        <div><dt>Closure</dt><dd>Open top</dd></div>\n      </dl>\n      <p style=\"margin-top:30px;\">It is cut to take an A4 folder flat, a laptop sleeve, a bottle and the rest of a day, with the handles dropped for shoulder carry over a coat.</p>\n      <div class=\"doc-aside\">\n        <p>The exact centimetres go up here the moment the first run is off the machines. Need them sooner? Email <a href=\"mailto:contact@normalize.world\">contact@normalize.world</a> and we will measure one for you the same day.</p>\n      </div>"
  },
  "contact": {
    "eyebrow": "Say hello",
    "title": "Contact Us",
    "lede": "One inbox, read by the people who actually make the things. Expect a reply within one or two working days.",
    "html": "\n      <p>Email <a href=\"mailto:contact@normalize.world\">contact@normalize.world</a>, or type it here.</p>\n      <form id=\"contact-form\">\n        <input type=\"text\" name=\"name\" placeholder=\"Your name\" required>\n        <input type=\"email\" name=\"email\" placeholder=\"Your email\" required>\n        <textarea rows=\"4\" name=\"message\" placeholder=\"Message\" required></textarea>\n        <button type=\"submit\" class=\"btn\">Send message</button>\n      </form>\n      <p class=\"form-status\" id=\"contact-status\" role=\"status\"></p>"
  },
  "track": {
    "eyebrow": "Where is it",
    "title": "Track Order",
    "lede": "Enter the AWB from your shipping confirmation — or your Normalize order number — for live courier scans.",
    "html": "\n      <form id=\"track-form\">\n        <input type=\"text\" name=\"awb\" placeholder=\"AWB / tracking number\" required>\n        <button type=\"submit\" class=\"btn\">Track shipment</button>\n      </form>\n      <p class=\"form-status\" id=\"track-status\" role=\"status\"></p>\n      <div id=\"track-result\"></div>\n      <div class=\"doc-aside\">\n        <p>Nothing yet? Scans usually start a few hours after the courier collects the parcel. Pre-book orders get a tracking number by email on the day they are dispatched.</p>\n      </div>"
  },
  "story": {
    "eyebrow": "Since the beginning",
    "title": "Our Story",
    "lede": "Normalize makes bags, apparel, caps and accessories out of one workshop in India.",
    "html": "\n      <p>The name is the whole argument. A good bag should not be an event. It should be the ordinary thing you reach for, that holds up, that you stop thinking about because it simply works.</p>\n      <ol class=\"doc-list\">\n        <li>\n          <h4>One thing at a time</h4>\n          <p>No seasons. No drops for the sake of drops. No ten variations of the same piece to fill a page. We finish one thing properly, then start the next.</p>\n        </li>\n        <li>\n          <h4>Made where we can see it</h4>\n          <p>Everything is cut and stitched in our own workshop, by people we know by name. When something is wrong we can walk over and say so.</p>\n        </li>\n        <li>\n          <h4>Built to be boring</h4>\n          <p>The compliment we want is not \"where did you get that\" — it is realising you have carried the same bag for four years and never thought about it once.</p>\n        </li>\n      </ol>\n      <p style=\"margin-top:34px;\">The Butterfly Tote is our first launch. If it earns its place, the next one follows.</p>"
  },
  "craft": {
    "eyebrow": "How it is made",
    "title": "Craftsmanship",
    "lede": "Jute, cotton and canvas, worked on our own machines. No mystery supply chain to describe.",
    "html": "\n      <ol class=\"doc-list\">\n        <li>\n          <h4>The fibre</h4>\n          <p>Jute is rain-fed, grown in the east of India, fast-growing and fully biodegradable — one of the lowest-impact textiles in production. It is woven, dyed and printed here.</p>\n        </li>\n        <li>\n          <h4>The construction</h4>\n          <p>The top edge is turned and bound rather than left raw. Handles are box-stitched where the load actually sits. The base is flat enough for the bag to stand up on its own.</p>\n        </li>\n        <li>\n          <h4>The finish</h4>\n          <p>Jute is honest about being jute. The weave stays open, the surface stays textured, and the print sits into the grain instead of on top of it.</p>\n        </li>\n        <li>\n          <h4>The runs are small</h4>\n          <p>Small enough that a flaw is caught by a person rather than a process. That is the whole quality-control system, and it is the reason we do not launch four things at once.</p>\n        </li>\n      </ol>"
  },
  "careers": {
    "eyebrow": "Work with us",
    "title": "Careers",
    "lede": "A small team, growing slowly and on purpose.",
    "html": "\n      <p>There is no listings page yet — when we hire, it is usually because someone wrote to us before we knew we needed them.</p>\n      <p>If you would like to be considered for design, production or operations, send your CV to <a href=\"mailto:contact@normalize.world\">contact@normalize.world</a>.</p>\n      <div class=\"doc-aside\">\n        <p>Tell us what you would like to work on and what you have made before. We read everything, and we reply to the ones we can act on.</p>\n      </div>"
  }
};
