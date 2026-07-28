import Link from "next/link";

/**
 * गृहस्ती logo lockup — Brand Identity §2.
 *
 * §2.2 primary lockup: the extended rule spans the full width above both
 * elements, then the ग tile, a 1px hairline divider, then the wordmark.
 * The extended shirorekha IS the identity system — the same rule reappears
 * above section headings, on card top edges and along the header.
 *
 * §2.2: the entire lockup is one single colour. The rule, the ग and the
 * wordmark never differ, so `tone` sets all three together.
 *
 * §1: the brand is Devanagari-first. The Latin "Grihasti" is functional
 * (domains, handles, legal) and is deliberately NOT part of the mark.
 */
export default function Lockup({
  href = "/",
  compact = false,
}: {
  href?: string | null;
  /** §2.3 stacked lockup: rule then wordmark, no ग. For narrow placements. */
  compact?: boolean;
}) {
  const inner = (
    <span className="lockup" aria-label="गृहस्ती — Grihasti">
      <span className="lockup__rule" />
      <span className="lockup__row">
        {!compact && (
          <>
            <span className="lockup__ga" aria-hidden="true">ग</span>
            <span className="lockup__divider" aria-hidden="true" />
          </>
        )}
        <span className="lockup__word">गृहस्ती</span>
      </span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
