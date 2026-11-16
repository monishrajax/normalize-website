import Panel from "./Panel";
import Catalogue from "./Catalogue";

/* The catalogue as its own full-viewport canvas — the same shop that sits on
   the home page, opened over it from "PRODUCTS" in the header.

   Full-bleed: the grid escapes the panel's reading measure and runs to both
   edges of the viewport, which is what makes a gutterless lattice read as a
   catalogue rather than a boxed-in widget. */
export default function ProductsPanel({ open, onClose, ...catalogue }) {
  return (
    <Panel open={open} onClose={onClose} eyebrow="The catalogue" wide>
      <Catalogue {...catalogue} gridClassName="full-bleed" />
    </Panel>
  );
}
