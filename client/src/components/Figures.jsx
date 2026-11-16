import { useId } from "react";

/* The two figures standing behind the curtain: faceless fashion-sketch
   illustrations, drawn in SVG so they cost no image request and scale to any
   screen. They are stand-ins — swap them for photography by replacing the
   <Man /> and <Woman /> in Showroom.jsx with <img> tags; nothing else depends
   on how they are drawn.

   The man is dressed in Dusk (the slate blue) and the woman in Dawn (the warm
   sand), the same two colours the editions of the first product already use.
   Both share one 220 x 540 box with the feet on y = 527, so they stand on the
   same floor line however they are placed. */

const SKIN = "#b9835b";
const SKIN_SHADE = "#9c6c47";
const HAIR = "#1d1612";
const SHOE = "#2a201a";
const GOLD = "#d4af37";

const Mirror = ({ children }) => <g transform="translate(220 0) scale(-1 1)">{children}</g>;

function Defs({ id }) {
  return (
    <defs>
      <radialGradient id={`${id}-floor`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#000" stopOpacity=".62" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity=".16" />
        <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".26" />
      </linearGradient>
    </defs>
  );
}

export function Man({ className = "" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shirt =
    "M99 90 Q78 92 56 102 C50 106 47 130 44 170 L39 262 L60 266 L64 190 C66 160 68 140 72 126 L74 288 L146 288 L148 126 C152 140 154 160 156 190 L160 266 L181 262 L176 170 C173 130 170 106 164 102 Q142 92 121 90 Q110 100 99 90 Z";
  const trousers =
    "M72 284 L148 284 L150 330 C150 400 146 460 140 504 L114 504 L110 352 L106 504 L80 504 C74 460 70 400 70 330 Z";

  return (
    <svg viewBox="0 0 220 540" className={className} aria-hidden="true" focusable="false">
      <Defs id={id} />
      <ellipse cx="110" cy="531" rx="74" ry="7" fill={`url(#${id}-floor)`} />

      {/* neck, head, ears, hair */}
      <path d="M100 72 L100 92 Q110 101 120 92 L120 72 Z" fill={SKIN_SHADE} />
      <ellipse cx="88.6" cy="52" rx="3.8" ry="6.4" fill={SKIN_SHADE} />
      <ellipse cx="131.4" cy="52" rx="3.8" ry="6.4" fill={SKIN_SHADE} />
      <ellipse cx="110" cy="49" rx="21.5" ry="28" fill={SKIN} />
      <path
        d="M88 50 C83 24 97 14 111 14 C127 14 137 28 132 50 C131 40 126 32 118 30 C108 28 95 30 90 40 Z"
        fill={HAIR}
      />

      {/* trousers and shoes */}
      <path d="M78 500 L108 500 L109 514 Q110 527 96 528 L70 528 Q60 528 64 519 Q70 513 78 500 Z" fill={SHOE} />
      <path d="M142 500 L112 500 L111 514 Q110 527 124 528 L150 528 Q160 528 156 519 Q150 513 142 500 Z" fill={SHOE} />
      <path d={trousers} fill="#d8cdb6" />
      <path d={trousers} fill={`url(#${id}-lit)`} />
      <path d="M92 300 L93 500 M128 300 L127 500" stroke="rgba(0,0,0,.1)" strokeWidth="1.6" fill="none" />
      <path d="M110 296 V344" stroke="rgba(0,0,0,.18)" strokeWidth="1.2" fill="none" />
      <path d="M106 504 L110 352 L114 504" fill="rgba(0,0,0,.1)" />

      {/* shirt */}
      <path d={shirt} fill="#6d7c9a" />
      <path d={shirt} fill={`url(#${id}-lit)`} />
      <path d="M39.6 250 L60 254 L60 266 L39 262 Z" fill="#566480" />
      <g>
        <Mirror>
          <path d="M39.6 250 L60 254 L60 266 L39 262 Z" fill="#566480" />
        </Mirror>
      </g>
      <path d="M99 89 L91 112 L110 125 L110 99 Z" fill="#8d9bb6" stroke="rgba(0,0,0,.3)" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M121 89 L129 112 L110 125 L110 99 Z" fill="#8d9bb6" stroke="rgba(0,0,0,.3)" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M110 125 V288" stroke="#566480" strokeWidth="1.4" fill="none" />
      {[144, 172, 200, 228, 256].map((y) => (
        <circle key={y} cx="110" cy={y} r="2.1" fill="#cfd6e2" stroke="rgba(0,0,0,.25)" strokeWidth=".6" />
      ))}
      <rect x="84" y="150" width="15" height="18" rx="1" fill="none" stroke="#566480" strokeWidth="1.2" />
      <path d="M82 150 Q80 200 84 262 M138 150 Q140 200 136 262" stroke="rgba(0,0,0,.12)" strokeWidth="2" fill="none" />

      {/* belt */}
      <path d="M72 284 H148 V295 H72 Z" fill="#3a2c22" />
      <rect x="103" y="283.4" width="14" height="12.4" rx="1.6" fill="none" stroke={GOLD} strokeWidth="2" />

      {/* hands */}
      <path d="M39.5 262 L60 266 C61 284 59 303 51 311 C43 315 36 309 36 297 C36 284 37.5 272 39.5 262 Z" fill={SKIN} />
      <Mirror>
        <path d="M39.5 262 L60 266 C61 284 59 303 51 311 C43 315 36 309 36 297 C36 284 37.5 272 39.5 262 Z" fill={SKIN} />
      </Mirror>
    </svg>
  );
}

export function Woman({ className = "" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dress =
    "M96 90 Q110 112 124 90 L148 102 C142 114 140 126 140 136 L136 238 C140 290 162 360 176 412 Q110 428 44 412 C58 360 80 290 84 238 L80 136 C80 126 78 114 72 102 Z";
  const arm = "M68 108 C60 114 58 146 56 184 L52 262 C51 274 52 286 57 292 C63 294 66 282 66 268 L70 192 C72 164 74 136 78 124 Z";
  const leg = "M91 408 L109 408 C109 440 107 470 105 504 L95 504 C93 470 92 440 91 408 Z";
  const heel = (
    <g>
      <path d="M92 500 L106 500 L109 512 Q110 520 102 520 L92 520 Q86 520 88 514 Z" fill={SHOE} />
      <path d="M91 518 L89.4 531 L93 531 L96 519 Z" fill={SHOE} />
    </g>
  );

  return (
    <svg viewBox="0 0 220 540" className={className} aria-hidden="true" focusable="false">
      <Defs id={id} />
      <ellipse cx="110" cy="531" rx="66" ry="7" fill={`url(#${id}-floor)`} />

      {/* hair behind, neck, head, hair in front */}
      <path d="M88 52 C82 16 138 16 132 52 C136 86 140 128 128 172 L92 172 C80 128 84 86 88 52 Z" fill="#1b130f" />
      <path d="M102 76 L102 98 Q110 104 118 98 L118 76 Z" fill="#a37250" />
      <ellipse cx="110" cy="52" rx="19" ry="26" fill="#c08b62" />
      <path
        d="M89 50 C86 24 100 14 111 14 C124 14 134 24 131 50 C129 40 123 31 112 29 C102 28 93 36 89 50 Z"
        fill="#1b130f"
      />

      {/* legs and heels */}
      <path d={leg} fill="#c08b62" />
      <g transform="translate(220 0) scale(-1 1)"><path d={leg} fill="#c08b62" /></g>
      {heel}
      <g transform="translate(220 0) scale(-1 1)">{heel}</g>

      {/* dress */}
      <path d={dress} fill="#b08d57" />
      <path d={dress} fill={`url(#${id}-lit)`} />
      <path d="M96 90 Q110 112 124 90" fill="none" stroke="#8f6f3f" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M96 248 Q84 330 62 418 M110 248 L110 426 M124 248 Q136 330 158 418" fill="none" stroke="rgba(0,0,0,.16)" strokeWidth="2" />
      <path d="M103 248 Q96 330 86 420 M117 248 Q124 330 134 420" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.4" />
      <path d="M83.6 232 H136.4 V244 H83.6 Z" fill={GOLD} stroke="rgba(0,0,0,.25)" strokeWidth=".6" />

      {/* arms */}
      <path d={arm} fill="#c08b62" />
      <g transform="translate(220 0) scale(-1 1)"><path d={arm} fill="#c08b62" /></g>
    </svg>
  );
}
