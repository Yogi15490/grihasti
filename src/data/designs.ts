/**
 * Grihasti — The Bhai-Behen Collection (Rakhi drop)
 * 14 fixed caricature designs + 1 gift set. Source of catalog + DB seed.
 * Prices in INR (MRP, GST-inclusive). Confirm final prices before launch.
 */

export interface Design {
  slug: string;
  name: string;
  type: "caricature" | "giftset";
  persona: string; // the sibling it captures
  cues: string; // visual cues (art direction)
  bestFor: string;
  priceInr: number;
  /** Suggested launch stock weighting — bestsellers get more (spec: production note). */
  weight: "high" | "medium" | "low";
}

export const SCENTS = ["Aangan at Dusk", "Sunday Slow"] as const;
export const CARICATURE_PRICE = 900;
export const GIFTSET_PRICE = 850;

export const DESIGNS: Design[] = [
  { slug: "cool-bhaiya", name: "The Cool Bhaiya", type: "caricature", persona: "The effortlessly-swaggy brother", cues: "Sunglasses, jacket, relaxed lean", bestFor: "Younger sib → cool elder brother", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "gym-beast", name: "The Gym Beast", type: "caricature", persona: "The gains-obsessed brother", cues: "Tank, shaker bottle, flexed arm", bestFor: "The fitness-mad brother", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "foodie-bhai", name: "The Foodie Bhai", type: "caricature", persona: "Lives for the next meal", cues: "Plate of biryani/samosa, happy grin", bestFor: "The brother who's always eating", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "gamer", name: "The Gamer", type: "caricature", persona: "Permanently online", cues: "Headset, controller, hoodie", bestFor: "The gamer sibling", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "tech-genius", name: "The Tech Genius", type: "caricature", persona: "The family's IT department", cues: "Glasses, laptop, hoodie", bestFor: "The nerdy/techie sibling", priceInr: CARICATURE_PRICE, weight: "low" },
  { slug: "cricket-fanatic", name: "The Cricket Fanatic", type: "caricature", persona: "Weekend warrior", cues: "Jersey, bat, mid-celebration", bestFor: "The cricket-obsessed brother", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "protector", name: "The Protector", type: "caricature", persona: "Stern face, softest heart", cues: "Arms crossed, warm eyes", bestFor: "The overprotective elder brother", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "drama-queen", name: "The Drama Queen", type: "caricature", persona: "Main character energy", cues: "Glam pose, dramatic flair", bestFor: "The theatrical sister", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "chai-behen", name: "The Chai-Fuelled Behen", type: "caricature", persona: "Runs on chai + gossip", cues: "Chai cup, cosy shawl", bestFor: "The homely, warm sister", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "bookworm", name: "The Bookworm", type: "caricature", persona: "Always mid-novel", cues: "Glasses, stack of books", bestFor: "The quiet, bookish sibling", priceInr: CARICATURE_PRICE, weight: "low" },
  { slug: "fashionista", name: "The Fashionista", type: "caricature", persona: "Never repeats an outfit", cues: "Trendy fit, shopping bags", bestFor: "The style-obsessed sister", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "boss-lady", name: "The Boss Lady", type: "caricature", persona: "Ambition in heels", cues: "Laptop, coffee, power pose", bestFor: "The career-driven sister", priceInr: CARICATURE_PRICE, weight: "medium" },
  { slug: "little-terror", name: "The Little Terror", type: "caricature", persona: "Cute, chaotic, beloved", cues: "Pigtails/spiky hair, mischievous grin", bestFor: "The youngest sibling", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "rakhi-classic", name: "The Rakhi Classic", type: "caricature", persona: "The sweet, sentimental one", cues: "Traditional outfit, rakhi on wrist", bestFor: "The buyer who wants heartfelt over funny", priceInr: CARICATURE_PRICE, weight: "high" },
  { slug: "gift-set", name: "The Rakhi Gift Set", type: "giftset", persona: "A ready-made signature candle + rakhi + card", cues: "Signature candle, rakhi thread, card", bestFor: "A simpler gift, or when a design sells out", priceInr: GIFTSET_PRICE, weight: "high" },
];

export const CARICATURES = DESIGNS.filter((d) => d.type === "caricature");
export const getDesign = (slug: string): Design | undefined =>
  DESIGNS.find((d) => d.slug === slug);
