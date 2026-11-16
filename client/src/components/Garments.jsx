import { useId } from "react";

/* Flat drawings of clothes on hangers, one <svg> per garment.

   Every drawing is 124 units wide and 232 tall and carries its own slice of
   the brass rod across the top (y 2.5-11.5), so when the items are laid edge
   to edge in a row the slices join into one continuous rod. The hook of each
   hanger is drawn as a ring centred on (62, 7) — the rod's centre line — so it
   reads as wrapped round the bar rather than floating under it.

   Colours here are decoration. They say "a shirt", not "our shirt": nothing in
   this file is a claim about a product. */

const EDGE = "rgba(255,255,255,.26)";    // a light edge so dark cloth still reads on the dark interior
const STITCH = "rgba(255,255,255,.46)";
const FOLD = "rgba(0,0,0,.15)";
const BRASS = "#d9b45c";
const WOOD = "#8a5a34";

/* ---- shared parts ------------------------------------------------------- */

function Hook() {
  const d = "M62 26 V13 A6 6 0 1 0 56 7";
  return (
    <>
      <path d={d} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="3.8" strokeLinecap="round" />
      <path d={d} fill="none" stroke={BRASS} strokeWidth="2.2" strokeLinecap="round" />
    </>
  );
}

function ShoulderHanger() {
  return (
    <g>
      <path
        d="M62 26 L8 47 Q4 49.5 8 51 L116 51 Q120 49.5 116 47 Z"
        fill={WOOD} stroke="rgba(0,0,0,.45)" strokeWidth=".7"
      />
      <Hook />
    </g>
  );
}

function ClipHanger({ a, b }) {
  return (
    <g>
      <rect
        x={a - 8} y="25" width={b - a + 16} height="3.4" rx="1.7"
        fill={WOOD} stroke="rgba(0,0,0,.45)" strokeWidth=".7"
      />
      <Hook />
    </g>
  );
}

function Clip({ x }) {
  return (
    <g>
      <rect x={x - 3.6} y="28" width="7.2" height="16" rx="1.7" fill="#cdd0d5" stroke="#767c84" strokeWidth=".7" />
      <rect x={x - 3.6} y="36" width="7.2" height="2.2" fill="rgba(0,0,0,.2)" />
    </g>
  );
}

/* A piece of cloth: the flat colour, then a soft top-light / bottom-shade wash
   over it, with the light edge. */
function Cloth({ d, fill, id }) {
  return (
    <>
      <path d={d} fill={fill} />
      <path d={d} fill={`url(#${id}-vol)`} stroke={EDGE} strokeWidth=".8" strokeLinejoin="round" />
    </>
  );
}

const Button = ({ x, y, r = 1.8, fill = "#f4f1ea" }) => (
  <circle cx={x} cy={y} r={r} fill={fill} stroke="rgba(0,0,0,.28)" strokeWidth=".6" />
);

const cableRope = (x, y0) =>
  `M${x} ${y0} ` + Array.from({ length: 5 }, () => "q4 3.6 0 7.2 q-4 3.6 0 7.2").join(" ");

/* ---- the garments ------------------------------------------------------- */

const SHIRT_BODY =
  "M46 27 L14 47 L5 160 L24 164 L31 84 L31 177 Q62 188 93 177 L93 84 L100 164 L119 160 L110 47 L78 27 Q62 40 46 27 Z";
const TEE_BODY =
  "M47 28 L14 47 L2 76 L22 86 L30 72 L30 150 Q62 155 94 150 L94 72 L102 86 L122 76 L110 47 L77 28 Q62 46 47 28 Z";
const SWEATER_BODY =
  "M46 28 L12 50 L3 154 L24 158 L33 92 L33 152 L91 152 L91 92 L100 158 L121 154 L112 50 L78 28 Q62 46 46 28 Z";
const TANK_BODY =
  "M38 28 C46 46 46 68 32 88 L32 152 Q62 157 92 152 L92 88 C78 68 78 46 86 28 L72 28 Q62 52 52 28 Z";

function Shorts({ id, base, edge, belt }) {
  return (
    <>
      <ClipHanger a={36} b={88} />
      <Cloth id={id} fill={base} d="M26 32 L98 32 L98 44 L106 122 L71 122 L62 76 L53 122 L18 122 L26 44 Z" />
      <path d="M26 32 H98 V44 H26 Z" fill="rgba(255,255,255,.1)" />
      {[32, 49, 75, 92].map((x) => (
        <rect key={x} x={x - 1.8} y="31" width="3.6" height="15" rx=".8" fill={edge} stroke="rgba(0,0,0,.25)" strokeWidth=".4" />
      ))}
      <circle cx="62" cy="38" r="2.3" fill="#e6d7b0" stroke="rgba(0,0,0,.3)" strokeWidth=".5" />
      <path d="M62 44 V66 Q62 72 56 72" fill="none" stroke={STITCH} strokeWidth=".9" />
      <path d="M29 44 Q40 52 41 70" fill="none" stroke={STITCH} strokeWidth=".9" />
      <path d="M95 44 Q84 52 83 70" fill="none" stroke={STITCH} strokeWidth=".9" />
      <path d="M19.2 114 L52.6 114 M71.4 114 L104.8 114" stroke={STITCH} strokeWidth=".8" strokeDasharray="2 2" />
      <path d="M62 76 L53 122 L48 122 L58 70 Z M62 76 L71 122 L76 122 L66 70 Z" fill={FOLD} />
      {belt && (
        <>
          <path d="M26 36 H98 V42 H26 Z" fill="#6a4630" />
          <rect x="54" y="34.2" width="16" height="9.6" rx="1.2" fill="none" stroke={BRASS} strokeWidth="1.6" />
        </>
      )}
      <Clip x={36} />
      <Clip x={88} />
    </>
  );
}

function Pants({ id, base, edge, flare }) {
  const d = flare
    ? "M30 32 L94 32 L94 44 L114 204 L72 204 L62 90 L52 204 L10 204 L30 44 Z"
    : "M26 32 L98 32 L98 44 L97 202 L69 202 L62 88 L55 202 L27 202 L26 44 Z";
  const lx = flare ? 40 : 41;
  const hemL = flare ? [11.6, 52] : [27.2, 55];
  const hemR = flare ? [72, 112.4] : [69, 96.8];
  return (
    <>
      <ClipHanger a={flare ? 40 : 36} b={flare ? 84 : 88} />
      <Cloth id={id} fill={base} d={d} />
      <path d={`M${flare ? 30 : 26} 32 H${flare ? 94 : 98} V44 H${flare ? 30 : 26} Z`} fill="rgba(255,255,255,.1)" />
      {(flare ? [35, 50, 74, 89] : [31, 48, 76, 91]).map((x) => (
        <rect key={x} x={x - 1.8} y="31" width="3.6" height="15" rx=".8" fill={edge} stroke="rgba(0,0,0,.25)" strokeWidth=".4" />
      ))}
      <circle cx="62" cy="38" r="2.4" fill="#e6d7b0" stroke="rgba(0,0,0,.3)" strokeWidth=".5" />
      <path d="M62 44 V68 Q62 74 56 74" fill="none" stroke={STITCH} strokeWidth=".9" />
      {flare ? (
        <>
          <path d="M43 44 L36 202 M81 44 L88 202" stroke={FOLD} strokeWidth="1.6" fill="none" />
          <path d="M31 44 Q42 50 44 66 M93 44 Q82 50 80 66" fill="none" stroke={STITCH} strokeWidth=".9" />
        </>
      ) : (
        <>
          <path d={`M${lx} 72 L${lx} 202 M${124 - lx} 72 L${124 - lx} 202`} stroke="rgba(255,255,255,.1)" strokeWidth="1.2" fill="none" />
          <path d="M29 44 Q40 50 42 68 M95 44 Q84 50 82 68" fill="none" stroke={STITCH} strokeWidth=".9" />
        </>
      )}
      <path
        d={`M${hemL[0]} 194 L${hemL[1]} 194 M${hemR[0]} 194 L${hemR[1]} 194`}
        stroke={STITCH} strokeWidth=".8" strokeDasharray="2 2"
      />
      <Clip x={flare ? 40 : 36} />
      <Clip x={flare ? 84 : 88} />
    </>
  );
}

function Socks({ id, c1, c2, squash = 1 }) {
  const body = "M30 30 L52 30 L52 108 Q54 124 40 124 L14 124 Q4 124 4 114 Q4 108 12 106 L30 98 Z";
  const sock = (
    <g>
      <path d={body} fill={c1} />
      <path d={body} fill={`url(#${id}-vol)`} stroke={EDGE} strokeWidth=".8" strokeLinejoin="round" />
      <rect x="30" y="34" width="22" height="2.6" fill={c2} />
      <rect x="30" y="40" width="22" height="2.6" fill={c2} />
      <path d="M52 106 L52 110 Q53 123 42 124 L39 124 Q47 119 46.5 106 Z" fill={c2} />
      <path d="M12 124 Q4 124 4 115 Q4 109 11 107 L14.5 107 Q10.5 115.5 14.5 124 Z" fill={c2} />
    </g>
  );
  const squashed = (m) => `translate(0 30) scale(1 ${squash}) translate(0 -30)${m ? " " + m : ""}`;
  return (
    <>
      <ClipHanger a={41} b={83} />
      <g transform={squashed()}>{sock}</g>
      <g transform={squashed("translate(124 0) scale(-1 1)")}>{sock}</g>
      <Clip x={41} />
      <Clip x={83} />
    </>
  );
}

const DRAW = {
  /* ---------- men ---------- */
  shirt: (id) => (
    <>
      <defs>
        <pattern id={`${id}-st`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="1.3" height="6" fill="rgba(255,255,255,.36)" />
        </pattern>
      </defs>
      <ShoulderHanger />
      <Cloth id={id} fill="#86a9cf" d={SHIRT_BODY} />
      <path d={SHIRT_BODY} fill={`url(#${id}-st)`} />
      <path d="M46 27 Q62 40 78 27 Q62 21 46 27 Z" fill="#46678c" />
      <path d="M5 160 L24 164 L31 84 L19 64 Z M119 160 L100 164 L93 84 L105 64 Z" fill={FOLD} />
      <path d="M5.6 150 L23.4 154 L24 164 L5 160 Z M118.4 150 L100.6 154 L100 164 L119 160 Z" fill="#eef3f8" stroke="rgba(0,0,0,.2)" strokeWidth=".6" />
      <Button x={11.5} y={157} r={1.3} />
      <Button x={112.5} y={157} r={1.3} />
      <rect x="57.5" y="50" width="9" height="134" fill="rgba(255,255,255,.2)" />
      {[62, 84, 106, 128, 150, 172].map((y) => <Button key={y} x={62} y={y} />)}
      <rect x="36" y="88" width="18" height="21" rx="1.2" fill="none" stroke={STITCH} strokeWidth=".9" />
      <path d="M36 88 H54 V94 L45 98 L36 94 Z" fill="rgba(255,255,255,.16)" stroke={STITCH} strokeWidth=".8" />
      <path d="M46 26 L41 47 L62 56 Z M78 26 L83 47 L62 56 Z" fill="#f4f7fb" stroke="rgba(0,0,0,.3)" strokeWidth=".8" strokeLinejoin="round" />
    </>
  ),

  tee: (id) => (
    <>
      <ShoulderHanger />
      <Cloth id={id} fill="#ece4d2" d={TEE_BODY} />
      <path d="M47 28 Q62 34 77 28 Q62 46 47 28 Z" fill="#b9ad92" />
      <path d="M2 76 L22 86 L30 72 L17 56 Z M122 76 L102 86 L94 72 L107 56 Z" fill={FOLD} />
      <path d="M47 28 Q62 46 77 28" fill="none" stroke="#c9bea5" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M4.4 73 L23.6 83 M119.6 73 L100.4 83" stroke="rgba(0,0,0,.28)" strokeWidth=".9" strokeDasharray="2 2" />
      <path d="M31 144 Q62 149 93 144" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth=".9" strokeDasharray="2 2" />
    </>
  ),

  shorts: (id) => <Shorts id={id} base="#c9ac72" edge="#b3955d" />,
  pants: (id) => <Pants id={id} base="#33425f" edge="#40517a" />,

  sweater: (id) => (
    <>
      <defs>
        <pattern id={`${id}-knit`} width="5" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 1 L2.5 4.4 L5 1" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1" />
        </pattern>
        <pattern id={`${id}-rib`} width="3.2" height="6" patternUnits="userSpaceOnUse">
          <rect width="1.3" height="6" fill="rgba(0,0,0,.28)" />
        </pattern>
      </defs>
      <ShoulderHanger />
      <Cloth id={id} fill="#5d8c74" d={SWEATER_BODY} />
      <path d={SWEATER_BODY} fill={`url(#${id}-knit)`} />
      <path d="M3 154 L24 158 L33 92 L18 70 Z M121 154 L100 158 L91 92 L106 70 Z" fill={FOLD} />
      {[50, 62, 74].map((x) => (
        <path key={x} d={cableRope(x, 62)} fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="1.7" strokeLinecap="round" />
      ))}
      <path d="M33 139 H91 V152 H33 Z" fill="#4c7761" />
      <path d="M33 139 H91 V152 H33 Z" fill={`url(#${id}-rib)`} />
      <path d="M3 142 L22 146 L24 158 L3 154 Z M121 142 L102 146 L100 158 L121 154 Z" fill="#4c7761" />
      <path d="M3 142 L22 146 L24 158 L3 154 Z M121 142 L102 146 L100 158 L121 154 Z" fill={`url(#${id}-rib)`} />
      <path d="M46 28 Q62 46 78 28" fill="none" stroke="#4c7761" strokeWidth="6.4" strokeLinecap="round" />
      <path d="M48 29 Q62 44 76 29" fill="none" stroke={`url(#${id}-rib)`} strokeWidth="6" />
    </>
  ),

  tank: (id) => (
    <>
      <ShoulderHanger />
      <Cloth id={id} fill="#c2603f" d={TANK_BODY} />
      <path d="M38 28 C46 46 46 68 32 88 M86 28 C78 46 78 68 92 88 M52 28 Q62 52 72 28" fill="none" stroke="#a24b30" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M32 88 L32 152 L40 152 L42 96 Z M92 88 L92 152 L84 152 L82 96 Z" fill={FOLD} />
      <path d="M33 146 Q62 151 91 146" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth=".9" strokeDasharray="2 2" />
    </>
  ),

  socks: (id) => <Socks id={id} c1="#ece4d2" c2="#b4553a" />,

  /* ---------- women ---------- */
  skirt: (id) => {
    const top = Array.from({ length: 8 }, (_, i) => 34 + i * 8);
    const bot = Array.from({ length: 8 }, (_, i) => 5 + i * (114 / 7));
    return (
      <>
        <ClipHanger a={40} b={84} />
        <Cloth id={id} fill="#c88f95" d="M34 32 L90 32 L90 44 L119 152 Q62 166 5 152 L34 44 Z" />
        {[0, 2, 4, 6].map((i) => (
          <path key={i} d={`M${top[i]} 44 L${bot[i]} 156 L${bot[i + 1]} 156 L${top[i + 1]} 44 Z`} fill="rgba(0,0,0,.12)" />
        ))}
        {top.map((x, i) => (
          <path key={i} d={`M${x} 44 L${bot[i]} 156`} stroke="rgba(255,255,255,.2)" strokeWidth=".8" />
        ))}
        <path d="M34 32 H90 V44 H34 Z" fill="rgba(255,255,255,.12)" />
        <circle cx="62" cy="38" r="2.2" fill="#f1dfcd" stroke="rgba(0,0,0,.3)" strokeWidth=".5" />
        <path d="M8.4 150 Q62 164 115.6 150" fill="none" stroke={STITCH} strokeWidth=".8" strokeDasharray="2 2" />
        <Clip x={40} />
        <Clip x={84} />
      </>
    );
  },

  dress: (id) => (
    <>
      <ShoulderHanger />
      <Cloth
        id={id} fill="#2f7a68"
        d="M38 30 C46 48 46 72 40 90 L44 120 C40 150 20 190 6 214 Q62 228 118 214 C104 190 84 150 80 120 L84 90 C78 72 78 48 86 30 L74 30 Q62 62 50 30 Z"
      />
      <path d="M38 30 C46 48 46 72 40 90 M86 30 C78 48 78 72 84 90 M50 30 Q62 62 74 30" fill="none" stroke="#235e50" strokeWidth="3" strokeLinecap="round" />
      <path d="M43.4 114 H80.6 L80 125 H44 Z" fill="#d9b45c" stroke="rgba(0,0,0,.28)" strokeWidth=".6" />
      <path d="M53 126 Q45 170 30 218 M62 126 L62 224 M71 126 Q79 170 94 218" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth="1.8" />
      <path d="M57 126 Q52 170 44 220 M67 126 Q72 170 80 220" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="1.2" />
      <path d="M8 208 Q62 222 116 208" fill="none" stroke={STITCH} strokeWidth=".8" strokeDasharray="2 2" />
    </>
  ),

  blouse: (id) => {
    const body =
      "M48 28 L16 48 L8 150 L26 154 L33 84 L33 162 Q62 170 91 162 L91 84 L98 154 L116 150 L108 48 L76 28 Q62 36 48 28 Z";
    return (
      <>
        <ShoulderHanger />
        <Cloth id={id} fill="#ecdcc3" d={body} />
        <path d="M8 150 L26 154 L33 84 L21 64 Z M116 150 L98 154 L91 84 L103 64 Z" fill={FOLD} />
        <path d="M8.4 140 L25.6 144 L26 154 L8 150 Z M115.6 140 L98.4 144 L98 154 L116 150 Z" fill="#d9c5a4" stroke="rgba(0,0,0,.2)" strokeWidth=".6" />
        <path d="M12 148 L12 156 M17 149 L17 157 M115 148 L115 156 M110 149 L110 157" stroke="rgba(0,0,0,.18)" strokeWidth=".8" />
        <path d="M62 44 V162" stroke="rgba(0,0,0,.1)" strokeWidth="1" />
        {[74, 96, 118, 140].map((y) => <Button key={y} x={62} y={y} r={1.7} fill="#fbf4e6" />)}
        <path d="M60.4 44 L50 76 L56.6 72.6 L61.4 79 L63 46 Z" fill="#dcc8a6" stroke="rgba(0,0,0,.25)" strokeWidth=".7" strokeLinejoin="round" />
        <path d="M63.6 44 L74 76 L67.4 72.6 L62.6 79 L61 46 Z" fill="#dcc8a6" stroke="rgba(0,0,0,.25)" strokeWidth=".7" strokeLinejoin="round" />
        <path d="M59 40 C47 27 38 40 46 49 C51 54 57 47 59 41 Z" fill="#e6d3b4" stroke="rgba(0,0,0,.28)" strokeWidth=".8" strokeLinejoin="round" />
        <path d="M65 40 C77 27 86 40 78 49 C73 54 67 47 65 41 Z" fill="#e6d3b4" stroke="rgba(0,0,0,.28)" strokeWidth=".8" strokeLinejoin="round" />
        <circle cx="62" cy="41" r="4.4" fill="#d3bd99" stroke="rgba(0,0,0,.3)" strokeWidth=".8" />
      </>
    );
  },

  wtee: (id) => (
    <>
      <ShoulderHanger />
      <Cloth
        id={id} fill="#b6a7cc"
        d="M48 30 L18 48 L8 72 L26 80 L33 68 L36 134 Q62 139 88 134 L91 68 L98 80 L116 72 L106 48 L76 30 Q62 58 48 30 Z"
      />
      <path d="M48 30 Q62 36 76 30 Q62 58 48 30 Z" fill="#8f80a8" />
      <path d="M48 30 Q62 58 76 30" fill="none" stroke="#9d8eb5" strokeWidth="4" strokeLinecap="round" />
      <path d="M8 72 L26 80 L33 68 L21 54 Z M116 72 L98 80 L91 68 L103 54 Z" fill={FOLD} />
      <path d="M10.2 69.6 L27 77 M113.8 69.6 L97 77" stroke="rgba(0,0,0,.26)" strokeWidth=".9" strokeDasharray="2 2" />
      <path d="M37 128 Q62 133 87 128" fill="none" stroke="rgba(0,0,0,.26)" strokeWidth=".9" strokeDasharray="2 2" />
    </>
  ),

  wshorts: (id) => <Shorts id={id} base="#5b78a3" edge="#6d8cb8" belt />,
  trousers: (id) => <Pants id={id} base="#b8905f" edge="#c9a272" flare />,

  cardigan: (id) => {
    const body =
      "M48 28 L14 50 L5 152 L26 156 L34 92 L34 164 L90 164 L90 92 L98 156 L119 152 L110 50 L76 28 L62 62 Z";
    return (
      <>
        <defs>
          <pattern id={`${id}-knit`} width="5" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 1 L2.5 4.4 L5 1" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
          </pattern>
          <pattern id={`${id}-rib`} width="3.2" height="6" patternUnits="userSpaceOnUse">
            <rect width="1.3" height="6" fill="rgba(0,0,0,.28)" />
          </pattern>
        </defs>
        <ShoulderHanger />
        <Cloth id={id} fill="#a3505a" d={body} />
        <path d={body} fill={`url(#${id}-knit)`} />
        <path d="M5 152 L26 156 L34 92 L19 70 Z M119 152 L98 156 L90 92 L105 70 Z" fill={FOLD} />
        <path d="M34 152 H90 V164 H34 Z" fill="#8c3f49" />
        <path d="M34 152 H90 V164 H34 Z" fill={`url(#${id}-rib)`} />
        <path d="M5 140 L24 144 L26 156 L5 152 Z M119 140 L100 144 L98 156 L119 152 Z" fill="#8c3f49" />
        <path d="M5 140 L24 144 L26 156 L5 152 Z M119 140 L100 144 L98 156 L119 152 Z" fill={`url(#${id}-rib)`} />
        <rect x="57" y="62" width="10" height="102" fill="#8c3f49" />
        <rect x="57" y="62" width="10" height="102" fill={`url(#${id}-rib)`} />
        <path d="M48 28 L62 62 L76 28" fill="none" stroke="#8c3f49" strokeWidth="5.4" strokeLinejoin="round" strokeLinecap="round" />
        {[76, 98, 120, 142].map((y) => <Button key={y} x={62} y={y} r={2.2} fill="#e8d6b8" />)}
      </>
    );
  },

  wtank: (id) => (
    <>
      <ShoulderHanger />
      <Cloth
        id={id} fill="#d2a947"
        d="M42 28 L46 28 Q50 52 62 66 Q74 52 78 28 L82 28 Q82 60 90 86 L96 140 Q62 148 28 140 L34 86 Q42 60 42 28 Z"
      />
      <path d="M46 28 Q50 52 62 66 Q74 52 78 28" fill="none" stroke="#b58f33" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M34 86 L28 140 L36 141 L42 96 Z M90 86 L96 140 L88 141 L82 96 Z" fill={FOLD} />
      <path d="M28 144 Q62 152 96 144" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.2" strokeDasharray="1.2 2.4" strokeLinecap="round" />
    </>
  ),

  wsocks: (id) => <Socks id={id} c1="#f4eee4" c2="#c88f95" squash={0.74} />,
};

export const GARMENT_KINDS = Object.keys(DRAW);

export default function Garment({ kind }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const draw = DRAW[kind];
  if (!draw) return null;
  return (
    <svg viewBox="0 0 124 232" className="wd-garment" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-rod`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e6ac" />
          <stop offset=".42" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#6b5120" />
        </linearGradient>
        <linearGradient id={`${id}-vol`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".13" />
          <stop offset="1" stopColor="#000" stopOpacity=".17" />
        </linearGradient>
      </defs>
      <rect x="0" y="2.5" width="124" height="9" fill={`url(#${id}-rod)`} />
      {draw(id)}
    </svg>
  );
}
