/* What hangs on the rod in each wardrobe, in order along the rod.

   `kind` picks the photograph (client/public/assets/showroom/garments/manifest.json);
   `label` is the caption that appears when the light is on it.

   These are photographs of kinds of clothing, not catalogue products: they carry no
   price and do not link anywhere. When a garment should open the real product, this is
   the file to add the product's slug to.

   A kind with no photograph in the manifest is simply left off the rod; it is never
   replaced by a drawing. Men's sleeveless has no photograph yet, so it is not listed. */
export const WARDROBES = {
  men: {
    title: "Men",
    items: [
      { kind: "shirt", label: "Shirt" },
      { kind: "tee", label: "T-shirt" },
      { kind: "sweater", label: "Sweater" },
      { kind: "pants", label: "Pants" },
      { kind: "shorts", label: "Shorts" },
      { kind: "socks", label: "Socks" },
    ],
  },
  women: {
    title: "Women",
    items: [
      { kind: "dress", label: "Dress" },
      { kind: "blouse", label: "Blouse" },
      { kind: "skirt", label: "Skirt" },
      { kind: "cardigan", label: "Cardigan" },
      { kind: "wtee", label: "T-shirt" },
      { kind: "trousers", label: "Trousers" },
      { kind: "wshorts", label: "Shorts" },
      { kind: "wtank", label: "Sleeveless" },
      { kind: "wsocks", label: "Socks" },
    ],
  },
};
