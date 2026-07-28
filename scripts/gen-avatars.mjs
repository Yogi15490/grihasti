/**
 * गृहस्ती — placeholder product art.
 *
 * One SVG per design into public/designs/. A stylised caricature candle with
 * a prop matching the sibling persona — enough for the grid to read as a real
 * shop while the photography is produced.
 *
 * Brand Identity §4 and §7 govern this file:
 *   · Flat fills only. NO GRADIENTS anywhere in the brand — the earlier
 *     version used a linearGradient ground, which was a direct violation.
 *   · Every tile shares one Band ground, so the page never exceeds the
 *     two-background-tone limit (§4).
 *   · Wax colours are drawn from the brand palette and disciplined tints of
 *     it, not invented hues.
 *
 * Generated locally rather than pulled from an avatar API: a storefront's
 * product images should not depend on a third-party CDN being reachable from
 * an Indian mobile network.
 *
 * Run: npm run gen:art
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "designs");

// §4 Colour
const PAPER  = "#F6F1E7";
const INK    = "#1C1A17";
const HALDI  = "#C98A2B";
const SAND   = "#DCD2BE";
const MADDER = "#A33A2B";
const INDIGO = "#2E3A5C";
const BAND   = "#F1EADB";

/**
 * Wax colour and persona prop per design. Colours sit on the brand palette or
 * disciplined tints of it, spread widely enough that a 15-tile grid doesn't
 * read as one flat block.
 */
const DESIGNS = {
  "cool-bhaiya":     { wax: INDIGO,    prop: "sunglasses" },
  "gym-beast":       { wax: MADDER,    prop: "dumbbell"   },
  "foodie-bhai":     { wax: HALDI,     prop: "plate"      },
  "gamer":           { wax: "#4A4A6A", prop: "headset"    },
  "tech-genius":     { wax: "#5C6E7E", prop: "specs"      },
  "cricket-fanatic": { wax: "#6B7A55", prop: "bat"        },
  "protector":       { wax: "#7A5A46", prop: "shield"     },
  "drama-queen":     { wax: "#9C4A5A", prop: "sparkle"    },
  "chai-behen":      { wax: "#B08A4F", prop: "chai"       },
  "bookworm":        { wax: "#6E7A62", prop: "book"       },
  "fashionista":     { wax: "#B5697E", prop: "handbag"    },
  "boss-lady":       { wax: "#3F5566", prop: "briefcase"  },
  "little-terror":   { wax: "#D19A4E", prop: "pigtails"   },
  "rakhi-classic":   { wax: "#C0703A", prop: "rakhi"      },
  "gift-set":        { wax: HALDI,     prop: "giftbox"    },
};

/** Persona props, drawn over the candle. */
function prop(kind) {
  switch (kind) {
    case "sunglasses":
      return `<g fill="${INK}">
        <rect x="152" y="196" width="38" height="26"/>
        <rect x="210" y="196" width="38" height="26"/>
        <rect x="188" y="205" width="24" height="5"/>
      </g>`;

    case "dumbbell":
      return `<g fill="${INK}" transform="translate(200 312)">
        <rect x="-46" y="-7" width="92" height="14"/>
        <rect x="-62" y="-19" width="18" height="38"/>
        <rect x="44" y="-19" width="18" height="38"/>
      </g>`;

    case "plate":
      return `<g transform="translate(200 316)">
        <ellipse cx="0" cy="0" rx="54" ry="15" fill="${PAPER}"/>
        <path d="M-26 -3 L-8 -22 L10 -3 Z" fill="${HALDI}"/>
        <circle cx="24" cy="-7" r="10" fill="${MADDER}"/>
      </g>`;

    case "headset":
      return `<g fill="${INK}">
        <path d="M148 190 A52 52 0 0 1 252 190" stroke="${INK}" stroke-width="11" fill="none"/>
        <rect x="136" y="186" width="20" height="38"/>
        <rect x="244" y="186" width="20" height="38"/>
        <path d="M244 214 q16 10 8 26" stroke="${INK}" stroke-width="5" fill="none"/>
      </g>`;

    case "specs":
      return `<g fill="none" stroke="${INK}" stroke-width="6">
        <circle cx="171" cy="209" r="19"/>
        <circle cx="229" cy="209" r="19"/>
        <path d="M190 209 h20"/>
      </g>`;

    case "bat":
      return `<g transform="translate(272 268) rotate(24)">
        <rect x="-9" y="-58" width="18" height="52" fill="${INK}"/>
        <rect x="-15" y="-6" width="30" height="62" fill="${SAND}"/>
        <circle cx="-46" cy="46" r="13" fill="${MADDER}"/>
      </g>`;

    case "shield":
      return `<g transform="translate(200 300)">
        <path d="M0 -34 L34 -20 V6 Q34 32 0 44 Q-34 32 -34 6 V-20 Z" fill="${SAND}"/>
        <path d="M0 -18 L16 -10 V6 Q16 20 0 26 Q-16 20 -16 6 V-10 Z" fill="${PAPER}"/>
      </g>`;

    case "sparkle":
      return `<g fill="${HALDI}">
        ${[[128, 150, 13], [278, 176, 10], [258, 300, 8], [140, 290, 9]]
          .map(([x, y, r]) =>
            `<path d="M${x} ${y - r} L${x + r * 0.32} ${y - r * 0.32} L${x + r} ${y} ` +
            `L${x + r * 0.32} ${y + r * 0.32} L${x} ${y + r} L${x - r * 0.32} ${y + r * 0.32} ` +
            `L${x - r} ${y} L${x - r * 0.32} ${y - r * 0.32} Z"/>`)
          .join("")}
      </g>`;

    case "chai":
      return `<g transform="translate(272 300)">
        <path d="M-26 -14 h46 v22 a16 16 0 0 1 -16 16 h-14 a16 16 0 0 1 -16 -16 Z" fill="${PAPER}"/>
        <path d="M20 -6 a13 13 0 0 1 0 20" stroke="${PAPER}" stroke-width="5" fill="none"/>
        <path d="M-14 -24 q6 -10 0 -18 M0 -24 q6 -10 0 -18" stroke="${SAND}" stroke-width="4" fill="none"/>
      </g>`;

    case "book":
      return `<g transform="translate(200 314)">
        <path d="M-52 -16 h48 v36 h-48 Z" fill="${PAPER}"/>
        <path d="M4 -16 h48 v36 H4 Z" fill="${SAND}"/>
        <path d="M0 -20 v44" stroke="${INK}" stroke-width="5"/>
      </g>`;

    case "handbag":
      return `<g transform="translate(276 302)">
        <rect x="-24" y="-8" width="48" height="38" fill="${MADDER}"/>
        <path d="M-12 -8 a12 12 0 0 1 24 0" stroke="${HALDI}" stroke-width="5" fill="none"/>
      </g>`;

    case "briefcase":
      return `<g transform="translate(200 318)">
        <rect x="-42" y="-12" width="84" height="42" fill="${INK}"/>
        <path d="M-14 -12 v-9 a6 6 0 0 1 6 -6 h16 a6 6 0 0 1 6 6 v9" stroke="${INK}"
              stroke-width="5" fill="none"/>
        <rect x="-8" y="4" width="16" height="7" fill="${HALDI}"/>
      </g>`;

    case "pigtails":
      return `<g>
        <circle cx="134" cy="196" r="20" fill="${INK}"/>
        <circle cx="266" cy="196" r="20" fill="${INK}"/>
        <rect x="126" y="176" width="16" height="8" fill="${MADDER}"/>
        <rect x="258" y="176" width="16" height="8" fill="${MADDER}"/>
      </g>`;

    case "rakhi":
      // The thread and its centre — Madder cord, Haldi boss, Ink eye.
      return `<g transform="translate(200 306)">
        <path d="M-58 0 q58 26 116 0" stroke="${MADDER}" stroke-width="9" fill="none"/>
        <circle cx="0" cy="13" r="15" fill="${HALDI}"/>
        <circle cx="0" cy="13" r="6" fill="${MADDER}"/>
      </g>`;

    case "giftbox":
      // A cross ribbon, no bow. The earlier bow curves rendered as two pale
      // blobs floating above the lid — worse than no bow at all.
      return `<g transform="translate(200 254)">
        <rect x="-72" y="-40" width="144" height="112" fill="${HALDI}"/>
        <rect x="-72" y="-40" width="144" height="26" fill="${MADDER}"/>
        <rect x="-8" y="-40" width="16" height="112" fill="${PAPER}"/>
        <rect x="-72" y="8" width="144" height="12" fill="${PAPER}"/>
      </g>`;

    default:
      return "";
  }
}

function svg(slug, { wax, prop: propKind }) {
  // The gift set is a box, not a candle — no face, no flame.
  const isBox = propKind === "giftbox";

  const candle = isBox
    ? ""
    : `
    <path d="M200 92 q17 22 17 36 a17 17 0 0 1 -34 0 q0 -14 17 -36 Z" fill="${HALDI}"/>
    <path d="M200 108 q8 12 8 20 a8 8 0 0 1 -16 0 q0 -8 8 -20 Z" fill="${PAPER}"/>
    <path d="M200 128 v14" stroke="${INK}" stroke-width="4"/>
    <rect x="126" y="150" width="148" height="188" fill="${wax}"/>
    <g fill="${INK}">
      <circle cx="177" cy="232" r="6"/>
      <circle cx="223" cy="232" r="6"/>
    </g>
    <path d="M182 252 q18 15 36 0" stroke="${INK}" stroke-width="5" fill="none"/>`;

  // §6: the rule as the top edge. Every tile carries the brand's signature.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${slug}">
  <rect width="400" height="400" fill="${BAND}"/>
  <rect x="0" y="0" width="400" height="8" fill="${HALDI}"/>
  <rect x="104" y="346" width="192" height="6" fill="${SAND}"/>
  ${candle}
  ${prop(propKind)}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

let n = 0;
for (const [slug, cfg] of Object.entries(DESIGNS)) {
  const out = svg(slug, cfg);

  // A malformed SVG renders as a blank tile and is easy to miss across
  // fifteen products.
  if (!out.trim().endsWith("</svg>") || (out.match(/<svg/g) || []).length !== 1) {
    throw new Error(`Generated SVG for ${slug} looks malformed`);
  }
  // §7: no gradients anywhere in the brand. Fail loudly rather than ship one.
  if (/Gradient|gradient/.test(out)) {
    throw new Error(`${slug} contains a gradient — forbidden by brand §4/§7`);
  }
  writeFileSync(join(OUT, `${slug}.svg`), out);
  n++;
}

console.log(`Wrote ${n} placeholder illustrations to public/designs/`);
