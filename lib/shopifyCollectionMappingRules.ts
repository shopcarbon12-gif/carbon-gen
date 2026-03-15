import { tokenizeCandidateText, type CollectionParserType } from "@/lib/shopifyCollectionSkuParser";

export type MappingRuleResult = {
  menuPathsToAssign: string[];
  directCollectionsToAssign: string[];
  unresolved: boolean;
  reason: string;
};

type MappingRuleInput = {
  parserType: CollectionParserType;
  routeKey: string;
  digit: string;
  title?: string;
  itemType?: string;
  sku?: string;
};

type RuleEntry = {
  menuPaths?: string[];
  directCollections?: string[];
  unresolved?: boolean;
  reason?: string;
};

const RULES: Record<string, Record<string, RuleEntry>> = {
  "11": {
    "1": { menuPaths: ["MEN > NEW & NOW > NEW ARRIVALS"] },
    "2": { menuPaths: ["MEN > NEW & NOW > SUMMER SETS"] },
    "3": { menuPaths: ["MEN > CLOTHING > T-SHIRTS"] },
    "4": { menuPaths: ["MEN > CLOTHING > GRAPHIC T-SHIRTS (SUMMER)"] },
    // Intentional: business confirmed same mapping as digit 4.
    "5": { menuPaths: ["MEN > CLOTHING > GRAPHIC T-SHIRTS (SUMMER)"] },
    "6": { menuPaths: ["MEN > CLOTHING > SHORTS"] },
    "7": { menuPaths: ["MEN > CLOTHING > SWIMWEAR"] },
    "8": { menuPaths: ["MEN > CLOTHING > TOPS"] },
    "9": { unresolved: true, reason: "IF SET: ERROR" },
    "0": { unresolved: true, reason: "IF SET: ERROR" },
  },
  "12": {
    "1": { menuPaths: ["MEN > NEW & NOW > WINTER SETS"] },
    "2": { menuPaths: ["MEN > CLOTHING > SWEATERS"] },
    "3": { menuPaths: ["MEN > CLOTHING > SWEATSHIRTS & HOODIES"] },
    "4": { menuPaths: ["MEN > CLOTHING > JACKETS & COATS"] },
    "5": { menuPaths: ["MEN > CLOTHING > PANTS"] },
    "6": { menuPaths: ["MEN > CLOTHING > JEANS"] },
    "7": { menuPaths: ["MEN > CLOTHING > SHIRTS"] },
    "8": { menuPaths: ["MEN > CLOTHING > LONG SLEEVE SHIRTS"] },
    "9": { unresolved: true, reason: "IF SET: ERROR" },
    "0": { unresolved: true, reason: "IF SET: ERROR" },
  },
  "21": {
    "1": { menuPaths: ["WOMEN > NEW & NOW > NEW ARRIVALS"] },
    "2": { menuPaths: ["WOMEN > NEW & NOW > SUMMER SETS"] },
    "3": { menuPaths: ["WOMEN > CLOTHING > DRESSES"] },
    "4": { menuPaths: ["WOMEN > CLOTHING > TOPS"] },
    "5": { menuPaths: ["WOMEN > CLOTHING > T-SHIRTS"] },
    "6": { menuPaths: ["WOMEN > CLOTHING > JEANS"], directCollections: ["clothing-jeans"] },
    "7": { menuPaths: ["WOMEN > CLOTHING > SKIRTS"] },
    "8": { menuPaths: ["WOMEN > CLOTHING > SHORTS"] },
    "9": { unresolved: true, reason: "IF SET: ERROR" },
    "0": { unresolved: true, reason: "IF SET: ERROR" },
  },
  "22": {
    "1": { menuPaths: ["WOMEN > NEW & NOW > WINTER SETS"] },
    "2": { menuPaths: ["WOMEN > CLOTHING > SWEATERS"] },
    "3": { menuPaths: ["WOMEN > CLOTHING > SWEATSHIRTS & HOODIES"] },
    "4": { menuPaths: ["WOMEN > CLOTHING > JACKETS & COATS"] },
    "5": { menuPaths: ["WOMEN > CLOTHING > PANTS & LEGGINGS"] },
    "6": { menuPaths: ["WOMEN > CLOTHING > JEANS"], directCollections: ["clothing-jeans"] },
    "7": { menuPaths: ["WOMEN > CLOTHING > DRESSES"] },
    "8": { menuPaths: ["WOMEN > CLOTHING > TRACKSUITS"] },
    "9": { unresolved: true, reason: "IF SET: ERROR" },
    "0": { unresolved: true, reason: "IF SET: ERROR" },
  },
};

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizePath(value: string) {
  return value
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function resolveCollectionMappingRules(input: MappingRuleInput): MappingRuleResult {
  if (!input.routeKey || !input.digit) {
    return {
      menuPathsToAssign: [],
      directCollectionsToAssign: [],
      unresolved: true,
      reason: "Missing route key or digit.",
    };
  }

  const routeRules = RULES[input.routeKey];
  const baseRule = routeRules?.[input.digit];
  if (!baseRule) {
    return {
      menuPathsToAssign: [],
      directCollectionsToAssign: [],
      unresolved: true,
      reason: "No exact mapping rule for this route/digit.",
    };
  }

  if (baseRule.unresolved) {
    return {
      menuPathsToAssign: [],
      directCollectionsToAssign: [],
      unresolved: true,
      reason: baseRule.reason || "IF SET: ERROR",
    };
  }

  const tokens = dedupe([
    ...tokenizeCandidateText(input.itemType || ""),
    ...tokenizeCandidateText(input.title || ""),
    ...tokenizeCandidateText(input.sku || ""),
  ]);
  const hasJeansSignal = tokens.includes("jeans") || tokens.includes("jean");

  const menuPaths = dedupe((baseRule.menuPaths || []).map(normalizePath));
  const directCollections = dedupe(baseRule.directCollections || []);
  // Business confirmation: women jeans should also directly assign clothing-jeans.
  if ((input.routeKey === "21" || input.routeKey === "22") && hasJeansSignal) {
    directCollections.push("clothing-jeans");
  }

  const reason =
    menuPaths.length > 0 || directCollections.length > 0
      ? `Matched ${input.routeKey}-${input.digit} via ${input.parserType} parser.`
      : "No rule outputs.";

  return {
    menuPathsToAssign: dedupe(menuPaths),
    directCollectionsToAssign: dedupe(directCollections),
    unresolved: false,
    reason,
  };
}
