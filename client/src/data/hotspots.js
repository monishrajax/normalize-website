/* The three navigation branches: where each one sits, how far it reaches, and
   the gnarled silhouette it draws.

   Each `paths` set is a GENUINELY DIFFERENT silhouette — a fan, an S-curve and
   a gnarled fork — 11 to 12 paths with stroke widths tapering 7 -> 1.3 from
   trunk to twig. Never the same path mirrored: three mirrored copies read
   instantly as a template and the whole conceit falls apart.

   `desktop` and `mobile` are the two placements: `hx`/`hy` is the anchor on
   the coin's rim, `blen` the reach in px, `bang` the bearing in degrees. That
   is the whole placement — the label is NOT positioned here. LaunchCanvas
   derives the tip from `blen` and `bang` and hangs the word off it, so the
   word cannot drift from the drawing (the old per-branch `nx`/`ny` offsets
   were that same tip, rounded by hand, plus a gap that left the twig pointing
   at the word's corner instead of into its end).

   Below 768px the branches shoot OUTWARD from a smaller coin as a radial halo
   — do not collapse all three to hx 50%, which stacks them over the artwork
   and is unreadable.

   `sproutAt` staggers the three so they arrive in sequence and then STAY. There
   is no scroll staging: the visitor must never have to hunt for the navigation. */
export const HOTSPOTS = [
  {
    key: "launch",
    label: "The Launch",
    target: "spotlight",
    gradientId: "bm-nav",
    sproutAt: 0.7,
    desktop: { hx: "36%", hy: "30%", blen: 166, bang: 206 },
    mobile:  { hx: "50%", hy: "36%", blen: 86, bang: -104 },
    paths: [
      {
            "d": "M6,62 C34,60 54,58 76,56",
            "w": 7.0
      },
      {
            "d": "M76,56 C102,53 126,52 150,54",
            "w": 4.6
      },
      {
            "d": "M150,54 C168,55 182,57 196,60",
            "w": 2.8
      },
      {
            "d": "M76,56 C88,42 96,32 102,18",
            "w": 3.4
      },
      {
            "d": "M102,18 C100,11 104,6 111,3",
            "w": 1.8
      },
      {
            "d": "M102,18 C109,16 116,17 124,14",
            "w": 1.7
      },
      {
            "d": "M112,53 C122,44 130,38 140,30",
            "w": 2.6
      },
      {
            "d": "M140,30 C146,24 154,22 162,21",
            "w": 1.6
      },
      {
            "d": "M96,55 C104,66 110,74 114,86",
            "w": 2.8
      },
      {
            "d": "M114,86 C112,94 116,100 122,105",
            "w": 1.6
      },
      {
            "d": "M136,54 C144,62 150,68 154,76",
            "w": 2.0
      },
      {
            "d": "M170,56 C177,50 183,47 190,44",
            "w": 1.7
      }
    ],
  },
  {
    key: "cart",
    label: "Your Bag",
    target: "cart",
    gradientId: "bm-cart",
    sproutAt: 1.0,
    desktop: { hx: "66%", hy: "44%", blen: 162, bang: -12 },
    mobile:  { hx: "21%", hy: "59%", blen: 70, bang: 112 },
    paths: [
      {
            "d": "M6,64 C30,70 52,72 74,66",
            "w": 7.0
      },
      {
            "d": "M74,66 C98,58 118,48 142,46",
            "w": 4.4
      },
      {
            "d": "M142,46 C162,45 180,50 196,58",
            "w": 2.6
      },
      {
            "d": "M60,70 C66,80 74,88 84,94",
            "w": 3.0
      },
      {
            "d": "M84,94 C92,98 100,99 108,97",
            "w": 1.7
      },
      {
            "d": "M96,58 C100,46 106,38 114,30",
            "w": 3.0
      },
      {
            "d": "M114,30 C114,22 119,16 126,12",
            "w": 1.7
      },
      {
            "d": "M114,30 C122,28 130,29 138,26",
            "w": 1.6
      },
      {
            "d": "M158,45 C164,37 172,32 182,28",
            "w": 2.2
      },
      {
            "d": "M182,28 C188,25 194,24 199,20",
            "w": 1.4
      },
      {
            "d": "M170,49 C176,56 180,62 183,70",
            "w": 1.8
      }
    ],
  },
  {
    key: "story",
    label: "Our Story",
    target: "story",
    gradientId: "bm-story",
    sproutAt: 1.3,
    desktop: { hx: "33%", hy: "72%", blen: 158, bang: 145 },
    mobile:  { hx: "58%", hy: "66%", blen: 80, bang: 72 },
    paths: [
      {
            "d": "M6,58 C28,54 44,52 62,52",
            "w": 7.0
      },
      {
            "d": "M62,52 C82,52 96,58 112,66",
            "w": 4.6
      },
      {
            "d": "M112,66 C132,74 152,78 172,78",
            "w": 3.0
      },
      {
            "d": "M172,78 C182,78 190,80 197,84",
            "w": 1.8
      },
      {
            "d": "M62,52 C80,44 96,38 116,34",
            "w": 4.0
      },
      {
            "d": "M116,34 C136,30 156,30 176,32",
            "w": 2.6
      },
      {
            "d": "M176,32 C184,33 191,36 197,40",
            "w": 1.6
      },
      {
            "d": "M92,44 C96,34 102,26 110,18",
            "w": 2.2
      },
      {
            "d": "M110,18 C112,12 118,8 125,6",
            "w": 1.4
      },
      {
            "d": "M138,70 C144,78 148,86 150,96",
            "w": 2.0
      },
      {
            "d": "M150,96 C148,103 152,109 158,113",
            "w": 1.3
      },
      {
            "d": "M148,32 C152,24 158,18 166,13",
            "w": 1.5
      }
    ],
  },
];
