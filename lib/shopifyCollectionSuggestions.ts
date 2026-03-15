import { normalizeMenuPath, tokenizeCandidateText } from "@/lib/shopifyCollectionSkuParser";

type SuggestionInput = {
  title?: string;
  itemType?: string;
  sku?: string;
  alreadyAssignedPaths?: string[];
};

type SuggestionRule = {
  id: string;
  anyTokens: string[];
  paths: string[];
};

const SUGGESTION_RULES: SuggestionRule[] = [
  { id: "jeans-men", anyTokens: ["men", "jeans", "skinny", "slim", "baggy"], paths: ["MEN > CLOTHING > JEANS"] },
  { id: "jeans-women", anyTokens: ["women", "jeans", "skinny", "relaxed", "flare"], paths: ["WOMEN > CLOTHING > JEANS"] },
  { id: "tshirts-men", anyTokens: ["men", "t-shirt", "tshirt", "tee"], paths: ["MEN > CLOTHING > T-SHIRTS"] },
  { id: "tshirts-women", anyTokens: ["women", "t-shirt", "tshirt", "tee"], paths: ["WOMEN > CLOTHING > T-SHIRTS"] },
  { id: "tops-women", anyTokens: ["women", "tops", "tank", "bodysuits"], paths: ["WOMEN > CLOTHING > TOPS"] },
  { id: "shirts-men", anyTokens: ["men", "shirts", "dress", "linen", "denim"], paths: ["MEN > CLOTHING > SHIRTS"] },
  { id: "swim-men", anyTokens: ["men", "swimwear", "swim"], paths: ["MEN > CLOTHING > SWIMWEAR"] },
  { id: "swim-women", anyTokens: ["women", "swimwear", "swimsuit", "swim"], paths: ["WOMEN > CLOTHING > SWIMWEAR"] },
  {
    id: "winter-women",
    anyTokens: ["women", "winter", "hoodie", "sweatshirt", "sweater"],
    paths: ["WOMEN > NEW & NOW > WINTER SETS"],
  },
  {
    id: "winter-men",
    anyTokens: ["men", "winter", "hoodie", "sweatshirt", "sweater"],
    paths: ["MEN > NEW & NOW > WINTER SETS"],
  },
];

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeMenuPath(value)).filter(Boolean)));
}

export function buildCollectionSuggestions(input: SuggestionInput): string[] {
  const tokens = dedupe([
    ...tokenizeCandidateText(input.title || ""),
    ...tokenizeCandidateText(input.itemType || ""),
    ...tokenizeCandidateText(input.sku || ""),
  ]);
  if (tokens.length < 1) return [];
  const tokenSet = new Set(tokens);
  const assigned = new Set(dedupe(input.alreadyAssignedPaths || []));
  const out: string[] = [];

  for (const rule of SUGGESTION_RULES) {
    const matched = rule.anyTokens.every((token) => tokenSet.has(token)) || rule.anyTokens.some((token) => tokenSet.has(token));
    if (!matched) continue;
    for (const path of rule.paths) {
      const normalizedPath = normalizeMenuPath(path);
      if (!normalizedPath || assigned.has(normalizedPath)) continue;
      out.push(normalizedPath);
    }
  }

  return dedupe(out);
}
