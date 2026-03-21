/**
 * Canonical ShopCarbon collection suggestion rows — keep in sync with
 * `data/shopcarbon_suggestion_rules.csv` (source of truth for merchandising).
 *
 * Each row: match any normalized `basePaths` after barcode auto-map, then emit `menuPaths`
 * in column order (stable dedupe applied in `shopifyCollectionSuggestions.ts`).
 */
export type ShopcarbonSuggestionRuleRow = {
  id: string;
  basePaths: string[];
  menuPaths: string[];
};

export const SHOPCARBON_SUGGESTION_RULE_ROWS: ShopcarbonSuggestionRuleRow[] = [
  {
    id: "csv-men-jeans-clothing",
    basePaths: ["MEN > CLOTHING > JEANS"],
    menuPaths: [
      "JEANS > MEN > SKINNY JEANS",
      "JEANS > MEN > SUPER SKINNY JEANS",
      "JEANS > MEN > SLIM JEANS",
      "JEANS > MEN > BAGGY",
    ],
  },
  {
    id: "csv-men-jeans-root",
    basePaths: ["JEANS > MEN"],
    menuPaths: [
      "JEANS > MEN > SKINNY JEANS",
      "JEANS > MEN > SUPER SKINNY JEANS",
      "JEANS > MEN > SLIM JEANS",
      "JEANS > MEN > BAGGY",
    ],
  },
  {
    id: "csv-men-jackets-coats",
    basePaths: ["MEN > CLOTHING > JACKETS & COATS"],
    menuPaths: ["MEN > NEW & NOW > WINTER SETS", "MEN > CLOTHING > TRACKSUITS"],
  },
  {
    id: "csv-men-tshirts",
    basePaths: ["MEN > CLOTHING > T-SHIRTS"],
    menuPaths: ["MEN > NEW & NOW > SUMMER SETS", "MEN > CLOTHING > SHIRTS", "MEN > NEW & NOW > WINTER SETS"],
  },
  {
    id: "csv-men-shirts",
    basePaths: ["MEN > CLOTHING > SHIRTS"],
    menuPaths: ["MEN > NEW & NOW > SUMMER SETS", "MEN > NEW & NOW > WINTER SETS"],
  },
  {
    id: "csv-men-sweatshirts-hoodies",
    basePaths: ["MEN > CLOTHING > SWEATSHIRTS & HOODIES"],
    menuPaths: ["MEN > NEW & NOW > WINTER SETS", "MEN > CLOTHING > TRACKSUITS"],
  },
  {
    id: "csv-men-sweaters",
    basePaths: ["MEN > CLOTHING > SWEATERS"],
    menuPaths: ["MEN > NEW & NOW > WINTER SETS", "MEN > CLOTHING > TRACKSUITS"],
  },
  {
    id: "csv-men-pants",
    basePaths: ["MEN > CLOTHING > PANTS"],
    menuPaths: ["MEN > CLOTHING > SWEATPANTS"],
  },
  {
    id: "csv-men-all-accessories",
    basePaths: ["MEN > ACCESSORIES & SHOES > ALL ACCESSORIES"],
    menuPaths: [
      "MEN > ACCESSORIES & SHOES > SOCKS & UNDERWEAR",
      "MEN > ACCESSORIES & SHOES > TIES",
      "MEN > ACCESSORIES & SHOES > JEWELRY",
      "MEN > ACCESSORIES & SHOES > SUNGLASSES",
      "MEN > ACCESSORIES & SHOES > FRAGRANCE & BEAUTY",
      "MEN > ACCESSORIES & SHOES > HATS",
      "MEN > ACCESSORIES & SHOES > BELTS",
    ],
  },
  {
    id: "csv-women-jeans-clothing",
    basePaths: ["WOMEN > CLOTHING > JEANS"],
    menuPaths: [
      "JEANS > WOMEN > SKINNY JEANS",
      "JEANS > WOMEN > RELAXED JEANS",
      "JEANS > WOMEN > FLARE & WIDE LEG JEANS",
    ],
  },
  {
    id: "csv-women-jeans-root",
    basePaths: ["JEANS > WOMEN"],
    menuPaths: ["JEANS > WOMEN > RELAXED JEANS", "JEANS > WOMEN > FLARE & WIDE LEG JEANS"],
  },
  {
    id: "csv-women-dresses",
    basePaths: ["WOMEN > CLOTHING > DRESSES"],
    menuPaths: [
      "WOMEN > CLOTHING > DRESSES > MINI DRESS",
      "WOMEN > CLOTHING > DRESSES > MIDI DRESS",
      "WOMEN > CLOTHING > DRESSES > MAXI DRESS",
      "WOMEN > CLOTHING > DRESSES > NIGHT DRESSES",
    ],
  },
  {
    id: "csv-women-jackets-coats",
    basePaths: ["WOMEN > CLOTHING > JACKETS & COATS"],
    menuPaths: ["WOMEN > NEW & NOW > WINTER SETS", "WOMEN > CLOTHING > MATCHING SETS"],
  },
  {
    id: "csv-women-tops",
    basePaths: ["WOMEN > CLOTHING > TOPS"],
    menuPaths: ["WOMEN > NEW & NOW > SUMMER SETS", "WOMEN > NEW & NOW > WINTER SETS", "WOMEN > CLOTHING > MATCHING SETS"],
  },
  {
    id: "csv-women-shorts",
    basePaths: ["WOMEN > CLOTHING > SHORTS"],
    menuPaths: ["WOMEN > NEW & NOW > SUMMER SETS", "WOMEN > CLOTHING > MATCHING SETS"],
  },
  {
    id: "csv-women-skirts",
    basePaths: ["WOMEN > CLOTHING > SKIRTS"],
    menuPaths: ["WOMEN > NEW & NOW > SUMMER SETS", "WOMEN > CLOTHING > MATCHING SETS"],
  },
  {
    id: "csv-women-pants-leggings",
    basePaths: ["WOMEN > CLOTHING > PANTS & LEGGINGS"],
    menuPaths: [
      "WOMEN > NEW & NOW > SUMMER SETS",
      "WOMEN > NEW & NOW > WINTER SETS",
      "WOMEN > CLOTHING > MATCHING SETS",
      "WOMEN > CLOTHING > TRACKSUITS",
    ],
  },
  {
    id: "csv-women-sweatpants",
    basePaths: ["WOMEN > CLOTHING > SWEATPANTS"],
    menuPaths: ["WOMEN > NEW & NOW > WINTER SETS", "WOMEN > CLOTHING > MATCHING SETS", "WOMEN > CLOTHING > TRACKSUITS"],
  },
  {
    id: "csv-women-sweatshirts-hoodies",
    basePaths: ["WOMEN > CLOTHING > SWEATSHIRTS & HOODIES"],
    menuPaths: ["WOMEN > NEW & NOW > WINTER SETS", "WOMEN > CLOTHING > MATCHING SETS", "WOMEN > CLOTHING > TRACKSUITS"],
  },
  {
    id: "csv-women-all-accessories",
    basePaths: ["WOMEN > ACCESSORIES & SHOES > ALL ACCESSORIES"],
    menuPaths: [
      "WOMEN > ACCESSORIES & SHOES > JEWELRY",
      "WOMEN > ACCESSORIES & SHOES > SUNGLASSES",
      "WOMEN > ACCESSORIES & SHOES > HATS",
      "WOMEN > ACCESSORIES & SHOES > FRAGRANCE & BEAUTY",
    ],
  },
];
