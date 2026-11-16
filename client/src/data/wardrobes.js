/* What hangs on the rod in each wardrobe, in order along the rod.

   `kind` picks the drawing in components/Garments.jsx; `label` is the caption
   written under it, so a visitor never has to guess what a shape is.

   These are illustrations of kinds of clothing, not catalogue products — they
   carry no price and do not link anywhere. When a garment should open the real
   product, this is the file to add the product's slug to. */
export const WARDROBES = {
  men: {
    title: "Men",
    items: [
      { kind: "shirt", label: "Shirt" },
      { kind: "tee", label: "T-shirt" },
      { kind: "shorts", label: "Shorts" },
      { kind: "pants", label: "Pants" },
      { kind: "sweater", label: "Sweater" },
      { kind: "tank", label: "Sleeveless" },
      { kind: "socks", label: "Socks" },
    ],
  },
  women: {
    title: "Women",
    items: [
      { kind: "skirt", label: "Skirt" },
      { kind: "dress", label: "Dress" },
      { kind: "blouse", label: "Blouse" },
      { kind: "wtee", label: "T-shirt" },
      { kind: "wshorts", label: "Shorts" },
      { kind: "trousers", label: "Trousers" },
      { kind: "cardigan", label: "Cardigan" },
      { kind: "wtank", label: "Sleeveless" },
      { kind: "wsocks", label: "Socks" },
    ],
  },
};
