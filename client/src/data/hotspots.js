/* Hotspot placement and the hand-drawn branch silhouettes that grow out of
   the coin, lifted from the original markup. Each branch is stroked with the
   polished-to-burnished metallic gradient defined in LaunchCanvas.

   x/y/nx/ny are the desktop layout: an anchor on the coin's surface and the
   offset to its label. `angle` is the mobile one — below 768px the branches
   splay outward from the coin's centre as a radial halo, never stacked over
   it, and the component derives nx/ny from this bearing instead. */
export const HOTSPOTS = [
  {
    "key": "launch",
    "angle": -128,
    "label": "The Launch",
    "target": "spotlight",
    "x": "36%",
    "y": "30%",
    "nx": "-150px",
    "ny": "-72px",
    "paths": [
      {
        "d": "M6,62 C34,60 54,58 76,56",
        "w": 7
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
        "w": 2
      },
      {
        "d": "M170,56 C177,50 183,47 190,44",
        "w": 1.7
      }
    ]
  },
  {
    "key": "cart",
    "angle": -18,
    "label": "Your bag",
    "target": "cart",
    "x": "66%",
    "y": "44%",
    "nx": "158px",
    "ny": "-34px",
    "paths": [
      {
        "d": "M6,64 C30,70 52,72 74,66",
        "w": 7
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
        "w": 3
      },
      {
        "d": "M84,94 C92,98 100,99 108,97",
        "w": 1.7
      },
      {
        "d": "M96,58 C100,46 106,38 114,30",
        "w": 3
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
    ]
  },
  {
    "key": "story",
    "angle": 118,
    "label": "Our story",
    "target": "story",
    "x": "33%",
    "y": "72%",
    "nx": "-128px",
    "ny": "88px",
    "paths": [
      {
        "d": "M6,58 C28,54 44,52 62,52",
        "w": 7
      },
      {
        "d": "M62,52 C82,52 96,58 112,66",
        "w": 4.6
      },
      {
        "d": "M112,66 C132,74 152,78 172,78",
        "w": 3
      },
      {
        "d": "M172,78 C182,78 190,80 197,84",
        "w": 1.8
      },
      {
        "d": "M62,52 C80,44 96,38 116,34",
        "w": 4
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
        "w": 2
      },
      {
        "d": "M150,96 C148,103 152,109 158,113",
        "w": 1.3
      },
      {
        "d": "M148,32 C152,24 158,18 166,13",
        "w": 1.5
      }
    ]
  }
];
