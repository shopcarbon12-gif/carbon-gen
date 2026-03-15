import { normalizeMenuPath, tokenizeCandidateText } from "@/lib/shopifyCollectionSkuParser";

type SuggestionInput = {
  autoMappedPaths?: string[];
  alreadyAssignedPaths?: string[];
  alreadyAssignedDirectCollections?: string[];
  title?: string;
  itemType?: string;
  sku?: string;
};

type SuggestionRule = {
  id: string;
  basePaths: string[];
  menuPaths?: string[];
  directCollections?: string[];
  requiresAnyTokens?: string[];
};

type CompiledSuggestionRule = {
  id: string;
  basePaths: string[];
  menuPaths: string[];
  directCollections: string[];
  requiresAnyTokens: string[];
};

export type CollectionSuggestionsResult = {
  menuPaths: string[];
  directCollections: string[];
};

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    id: "jeans-men-from-men-clothing",
    basePaths: ["MEN > CLOTHING > JEANS"],
    menuPaths: [
      "JEANS > MEN > SKINNY JEANS",
      "JEANS > MEN > SUPER SKINNY JEANS",
      "JEANS > MEN > BAGGY",
      "JEANS > MEN > SLIM JEANS",
    ],
  },
  {
    id: "jeans-men-from-jeans-root",
    basePaths: ["JEANS > MEN"],
    menuPaths: [
      "JEANS > MEN > SKINNY JEANS",
      "JEANS > MEN > SUPER SKINNY JEANS",
      "JEANS > MEN > BAGGY",
      "JEANS > MEN > SLIM JEANS",
    ],
  },
  {
    id: "jeans-women-from-women-clothing",
    basePaths: ["WOMEN > CLOTHING > JEANS"],
    menuPaths: [
      "JEANS > WOMEN > SKINNY JEANS",
      "JEANS > WOMEN > RELAXED JEANS",
      "JEANS > WOMEN > FLARE & WIDE LEG JEANS",
    ],
  },
  {
    id: "jeans-women-from-jeans-root",
    basePaths: ["JEANS > WOMEN"],
    menuPaths: [
      "JEANS > WOMEN > SKINNY JEANS",
      "JEANS > WOMEN > RELAXED JEANS",
      "JEANS > WOMEN > FLARE & WIDE LEG JEANS",
    ],
  },
  {
    id: "dresses-women",
    basePaths: ["WOMEN > CLOTHING > DRESSES"],
    directCollections: [
      "midi-dresses-women",
      "maxi-dresses-women",
      "mini-dresses",
      "night-dresses",
    ],
  },
  {
    id: "tshirts-men",
    basePaths: ["MEN > CLOTHING > T-SHIRTS"],
    menuPaths: ["MEN > CLOTHING > TOPS"],
  },
  {
    id: "tops-women-generic",
    basePaths: ["WOMEN > CLOTHING > TOPS"],
    menuPaths: [
      "WOMEN > NEW & NOW > SUMMER SETS",
      "WOMEN > NEW & NOW > WINTER SETS",
      "WOMEN > CLOTHING > MATCHING SETS",
    ],
  },
  {
    id: "tops-women-to-tshirts-signal",
    basePaths: ["WOMEN > CLOTHING > TOPS"],
    requiresAnyTokens: ["t-shirt", "tshirt", "tee"],
    menuPaths: ["WOMEN > CLOTHING > T-SHIRTS"],
  },
];

function dedupePaths(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeMenuPath(value)).filter(Boolean)));
}

function normalizeToken(value: string) {
  return String(value || "").trim().toLowerCase();
}

function dedupeTokens(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeToken(value)).filter(Boolean)));
}

function normalizeCollectionHandle(value: string) {
  return String(value || "").trim().toLowerCase();
}

function dedupeCollectionHandles(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeCollectionHandle(value)).filter(Boolean)));
}

const COMPILED_SUGGESTION_RULES: CompiledSuggestionRule[] = SUGGESTION_RULES.map((rule) => ({
  id: rule.id,
  basePaths: dedupePaths(rule.basePaths),
  menuPaths: dedupePaths(rule.menuPaths || []),
  directCollections: dedupeCollectionHandles(rule.directCollections || []),
  requiresAnyTokens: dedupeTokens(rule.requiresAnyTokens || []),
}));

export function buildCollectionSuggestions(input: SuggestionInput): CollectionSuggestionsResult {
  const autoMappedPathSet = new Set(dedupePaths(input.autoMappedPaths || []));
  if (autoMappedPathSet.size < 1) {
    return { menuPaths: [], directCollections: [] };
  }
  const tokenSet = new Set(
    dedupeTokens([
      ...tokenizeCandidateText(input.title || ""),
      ...tokenizeCandidateText(input.itemType || ""),
      ...tokenizeCandidateText(input.sku || ""),
    ])
  );
  const assigned = new Set(dedupePaths(input.alreadyAssignedPaths || []));
  const assignedDirectCollections = new Set(dedupeCollectionHandles(input.alreadyAssignedDirectCollections || []));
  const outMenuPaths: string[] = [];
  const outDirectCollections: string[] = [];

  for (const rule of COMPILED_SUGGESTION_RULES) {
    if (!rule.basePaths.some((path) => autoMappedPathSet.has(path))) continue;
    if (rule.requiresAnyTokens.length > 0 && !rule.requiresAnyTokens.some((token) => tokenSet.has(token))) continue;
    for (const path of rule.menuPaths) {
      const normalizedPath = normalizeMenuPath(path);
      if (!normalizedPath || assigned.has(normalizedPath)) continue;
      outMenuPaths.push(normalizedPath);
    }
    for (const handle of rule.directCollections) {
      const normalizedHandle = normalizeCollectionHandle(handle);
      if (!normalizedHandle || assignedDirectCollections.has(normalizedHandle)) continue;
      outDirectCollections.push(normalizedHandle);
    }
  }

  return {
    menuPaths: dedupePaths(outMenuPaths),
    directCollections: dedupeCollectionHandles(outDirectCollections),
  };
}
