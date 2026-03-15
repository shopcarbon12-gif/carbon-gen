import { resolveCollectionMappingRules } from "@/lib/shopifyCollectionMappingRules";
import { parseSkuRouteInfo } from "@/lib/shopifyCollectionSkuParser";
import { buildCollectionSuggestions } from "@/lib/shopifyCollectionSuggestions";

export type MappingDecision = "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";

export type CollectionAutoMapInput = {
  sku: string;
  upc: string;
  title: string;
  itemType: string;
  assignedMenuPaths: string[];
};

export type CollectionAutoMapResult = {
  parserType: "NEW" | "LEGACY" | "UNKNOWN";
  routeKey: string;
  digit: string;
  barcodeLabel: string;
  mappingDecision: MappingDecision;
  reviewReason: string;
  autoMappedPaths: string[];
  directCollectionsToAssign: string[];
  suggestedPaths: string[];
};

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function computeCollectionAutoMap(input: CollectionAutoMapInput): CollectionAutoMapResult {
  const parsed = parseSkuRouteInfo({
    sku: input.sku,
    upc: input.upc,
    title: input.title,
    itemType: input.itemType,
  });
  const ruleResult = resolveCollectionMappingRules({
    parserType: parsed.parserType,
    routeKey: parsed.routeKey,
    digit: parsed.digit,
    title: input.title,
    itemType: input.itemType,
    sku: input.sku,
  });
  const autoMappedPaths = dedupe(ruleResult.menuPathsToAssign);
  const directCollectionsToAssign = dedupe(ruleResult.directCollectionsToAssign);
  const suggestedPaths = buildCollectionSuggestions({
    title: input.title,
    itemType: input.itemType,
    sku: input.sku,
    alreadyAssignedPaths: [...input.assignedMenuPaths, ...autoMappedPaths],
  });

  let mappingDecision: MappingDecision = "MANUAL_REVIEW";
  let reviewReason = ruleResult.reason;
  if (!ruleResult.unresolved && (autoMappedPaths.length > 0 || directCollectionsToAssign.length > 0)) {
    mappingDecision = "AUTO_MAPPED";
  } else if (suggestedPaths.length > 0) {
    mappingDecision = "SUGGESTED";
    if (!reviewReason) reviewReason = "Suggestion candidates available.";
  } else if (!reviewReason) {
    reviewReason = "No auto-map or suggestions matched.";
  }

  return {
    parserType: parsed.parserType,
    routeKey: parsed.routeKey,
    digit: parsed.digit,
    barcodeLabel: parsed.barcodeLabel,
    mappingDecision,
    reviewReason,
    autoMappedPaths,
    directCollectionsToAssign,
    suggestedPaths,
  };
}
