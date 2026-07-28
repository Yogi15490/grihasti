/**
 * Grihasti — placeholder product art.
 *
 * Generates one SVG per design into public/designs/. Each is a stylised
 * caricature candle in the brand palette, with a prop that matches the
 * sibling persona — enough to make the grid read as a real shop while the
 * photography is being produced.
 *
 * Deliberately generated locally rather than pulled from an avatar API:
 * a live storefront should not depend on a third-party CDN being reachable
 * from Indian mobile networks, and inline SVG costs one request from our
 * own origin.
 *
 * Run: node scripts/gen-avatars.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "designs");

// Brand palette (globals.css)
const CREAM = "#F4ECDD";
const EMBER = "#3B322C";
const CLAY = "#C0603D";
const BRASS = "#B08A4F";
const SAGE = "#8B9A7B";
const SAFFRON = "#E8A13A";

/**
 * Per-design wax colour and prop. Colours are spread across the palette so a
 * 15-tile grid doesn't read as one flat block.
 */
const DESIGNS = {
  "cool-bhaiya":     { wax: "#5B6B7C", prop: "sunglasses", bg: "#E9E2D4" },
  "gym-beast":       { wax: "#C0603D", prop: "dumbbell",   bg: "#F0E4D8" },
  "foodie-bhai":     { wax: "#E8A13A", prop: "plate",      bg: "#F2E9D6" },
  "gamer":           { wax: "#7A6A9B", prop: "headset",    bg: "#EBE5DC" },
  "tech-genius":     { wax: "#6E8CA0", prop: "specs",      bg: "#E8E6DE" },
  "cricket-fanatic": { wax: "#5E8C61", prop: "bat",        bg: "#EDE9D9" },
  "protector":       { wax: "#8B5E4A", prop: "shield",     bg: "#EFE3D5" },
  "drama-queen":     { wax: "#C25E7A", prop: "sparkle",    bg: "#F3E4E1" },
  "chai-behen":      { wax: "#B08A4F", prop: "chai",       bg: "#F1E8D7" },
  "bookworm":        { wax: "#7E8B6B", prop: "book",       bg: "#EAE9DC" },
  "fashionista":     { wax: "#D08BA0", prop: "handbag",    bg: "#F4E6E6" },
  "boss-lady":       { wax: "#4F6470", prop: "briefcase",  bg: "#E7E8E4" },
  "little-terror":   { wax: "#E0A05C", prop: "pigtails",   bg: "#F5EADB" },
  "rakhi-classic":   { wax: "#CE8A5C", prop: "rakhi",      bg: "#F3E7D6" },
  "gift-set":        { wax: "#C0603D", prop: "giftbox",    bg: "#F0E7D9" },
};

/** Persona props, drawn over the candle. */
function prop(kind) {
  switch (kind) {
    case "sunglasses":
      return `<g>
        <rect x="152" y="196" width="38" height="26" rx="8" fill="${EMBER}"/>
        <rect x="210" y="196" width="38" height="26" rx="8" fill="${EMBER}"/>
        <rect x="188" y="205" width="24" height="5" fill="${EMBER}"/>
      </g>`;

    case "dumbbell":
      return `<g transform="translate(200 310)">
        <rect x="-46" y="-7" width="92" height="14" rx="7" fill="${EMBER}"/>
        <rect x="-62" y="-19" width="18" height="38" rx="6" fill="${EMBER}"/>
        <rect x="44" y="-19" width="18" height="38" rx="6" fill="${EMBER}"/>
      </g>`;

    case "plate":
      return `<g transform="translate(200 316)">
        <ellipse cx="0" cy="0" rx="54" ry="15" fill="#fff" opacity=".92"/>
        <path d="M-26 -3 L-8 -22 L10 -3 Z" fill="${SAFFRON}"/>
        <circle cx="24" cy="-7" r="10" fill="${CLAY}"/>
      </g>`;

    case "headset":
      return `<g fill="${EMBER}">
        <path d="M148 190 A52 52 0 0 1 252 190" stroke="${EMBER}" stroke-width="11" fill="none" stroke-linecap="round"/>
        <rect x="136" y="186" width="20" height="38" rx="9"/>
        <rect x="244" y="186" width="20" height="38" rx="9"/>
        <path d="M244 214 q16 10 8 26" stroke="${EMBER}" stroke-width="5" fill="none" stroke-linecap="round"/>
      </g>`;

    case "specs":
      return `<g fill="none" stroke="${EMBER}" stroke-width="6">
        <circle cx="171" cy="209" r="19"/>
        <circle cx="229" cy="209" r="19"/>
        <path d="M190 209 h20" stroke-linecap="round"/>
      </g>`;

    case "bat":
      return `<g transform="translate(272 268) rotate(24)">
        <rect x="-9" y="-58" width="18" height="52" rx="6" fill="${BRASS}"/>
        <rect x="-15" y="-6" width="30" height="62" rx="10" fill="#E4D3B4"/>
        <circle cx="-46" cy="46" r="13" fill="${CLAY}"/>
      </g>`;

    case "shield":
      return `<g transform="translate(200 300)">
        <path d="M0 -34 L34 -20 V6 Q34 32 0 44 Q-34 32 -34 6 V-20 Z"
              fill="${BRASS}" opacity=".9"/>
        <path d="M0 -18 L16 -10 V6 Q16 20 0 26 Q-16 20 -16 6 V-10 Z" fill="${CREAM}" opacity=".55"/>
      </g>`;

    case "sparkle":
      return `<g fill="${SAFFRON}">
        ${[[128, 150, 13], [278, 176, 10], [258, 300, 8], [140, 290, 9]]
          .map(([x, y, r]) =>
            `<path d="M${x} ${y - r} L${x + r * 0.32} ${y - r * 0.32} L${x + r} ${y} L${x + r * 0.32} ${y + r * 0.32} L${x} ${y + r} L${x - r * 0.32} ${y + r * 0.32} L${x - r} ${y} L${x - r * 0.32} ${y - r * 0.32} Z"/>`)
          .join("")}
      </g>`;

    case "chai":
      return `<g transform="translate(272 300)">
        <path d="M-26 -14 h46 v22 a16 16 0 0 1 -16 16 h-14 a16 16 0 0 1 -16 -16 Z" fill="#fff" opacity=".95"/>
        <path d="M20 -6 a13 13 0 0 1 0 20" stroke="#fff" stroke-width="5" fill="none" opacity=".95"/>
        <path d="M-14 -24 q6 -10 0 -18 M0 -24 q6 -10 0 -18" stroke="${CREAM}" stroke-width="4"
              fill="none" opacity=".8" stroke-linecap="round"/>
      </g>`;

    case "book":
      return `<g transform="translate(200 316)">
        <path d="M-52 -14 h48 v34 h-48 Z" fill="#fff" opacity=".95"/>
        <path d="M4 -14 h48 v34 H4 Z" fill="#F0E6D2"/>
        <path d="M0 -18 v42" stroke="${EMBER}" stroke-width="5"/>
      </g>`;

    case "handbag":
      return `<g transform="translate(276 302)">
        <rect x="-24" y="-8" width="48" height="38" rx="7" fill="${CLAY}"/>
        <path d="M-12 -8 a12 12 0 0 1 24 0" stroke="${BRASS}" stroke-width="5" fill="none"/>
      </g>`;

    case "briefcase":
      return `<g transform="translate(200 318)">
        <rect x="-42" y="-12" width="84" height="42" rx="7" fill="${EMBER}"/>
        <path d="M-14 -12 v-9 a6 6 0 0 1 6 -6 h16 a6 6 0 0 1 6 6 v9" stroke="${EMBER}"
              stroke-width="5" fill="none"/>
        <rect x="-8" y="4" width="16" height="7" rx="3" fill="${BRASS}"/>
      </g>`;

    case "pigtails":
      return `<g fill="${EMBER}">
        <circle cx="134" cy="196" r="20"/>
        <circle cx="266" cy="196" r="20"/>
        <rect x="126" y="176" width="16" height="8" rx="4" fill="${CLAY}"/>
        <rect x="258" y="176" width="16" height="8" rx="4" fill="${CLAY}"/>
      </g>`;

    case "rakhi":
      return `<g transform="translate(200 306)">
        <path d="M-58 0 q58 26 116 0" stroke="${CLAY}" stroke-width="9" fill="none" stroke-linecap="round"/>
        <circle cx="0" cy="13" r="15" fill="${SAFFRON}"/>
        <circle cx="0" cy="13" r="6" fill="${CLAY}"/>
      </g>`;

    case "giftbox":
      return `<g transform="translate(200 250)">
        <rect x="-70" y="-34" width="140" height="104" rx="10" fill="${CLAY}"/>
        <rect x="-70" y="-34" width="140" height="30" rx="8" fill="#A9502F"/>
        <rect x="-11" y="-34" width="22" height="104" fill="${SAFFRON}"/>
        <path d="M-11 -34 q-30 -34 -6 -34 q18 0 6 34 Z" fill="${SAFFRON}"/>
        <path d="M11 -34 q30 -34 6 -34 q-18 0 -6 34 Z" fill="${SAFFRON}"/>
      </g>`;

    default:
      return "";
  }
}

function svg(slug, { wax, prop: propKind, bg }) {
  // The gift set is a box, not a candle — no face or flame.
  const isBox = propKind === "giftbox";

  const candle = isBox
    ? ""
    : `
    <!-- flame -->
    <g>
      <ellipse cx="200" cy="120" rx="26" ry="34" fill="${SAFFRON}" opacity=".22"/>
      <path d="M200 92 q17 22 17 36 a17 17 0 0 1 -34 0 q0 -14 17 -36 Z" fill="${SAFFRON}"/>
      <path d="M200 108 q8 12 8 20 a8 8 0 0 1 -16 0 q0 -8 8 -20 Z" fill="${CREAM}" opacity=".85"/>
    </g>
    <!-- wick -->
    <path d="M200 128 v14" stroke="${EMBER}" stroke-width="4" stroke-linecap="round"/>
    <!-- body -->
    <path d="M136 150 h128 a10 10 0 0 1 10 10 v168 a10 10 0 0 1 -10 10 h-128
             a10 10 0 0 1 -10 -10 v-168 a10 10 0 0 1 10 -10 Z" fill="${wax}"/>
    <!-- melt highlight -->
    <path d="M136 150 h128 a10 10 0 0 1 10 10 v12 q-32 12 -74 12 t-74 -12 v-12
             a10 10 0 0 1 10 -10 Z" fill="#fff" opacity=".18"/>
    <!-- face -->
    <g fill="${EMBER}">
      <circle cx="177" cy="232" r="6"/>
      <circle cx="223" cy="232" r="6"/>
    </g>
    <path d="M182 252 q18 15 36 0" stroke="${EMBER}" stroke-width="5" fill="none" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${slug} placeholder illustration">
  <defs>
    <linearGradient id="bg-${slug}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${CREAM}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg-${slug})"/>
  <ellipse cx="200" cy="352" rx="96" ry="16" fill="${SAGE}" opacity=".18"/>
  ${candle}
  ${prop(propKind)}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

let n = 0;
for (const [slug, cfg] of Object.entries(DESIGNS)) {
  const out = svg(slug, cfg);
  // Cheap structural check — a malformed SVG renders as a blank tile and is
  // easy to miss across fifteen products.
  if (!out.trim().endsWith("</svg>") || (out.match(/<svg/g) || []).length !== 1) {
    throw new Error(`Generated SVG for ${slug} looks malformed`);
  }
  writeFileSync(join(OUT, `${slug}.svg`), out);
  n++;
}

console.log(`Wrote ${n} placeholder illustrations to public/designs/`);
