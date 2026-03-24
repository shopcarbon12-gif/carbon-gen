/**
 * Run ALL remaining GSC 404 filters via Playwright MCP.
 * Outputs JSON to stdout for each filter - pipe to save script.
 *
 * FILTERS list - run each, extract, output JSON line, clear, next.
 * Meant to be driven by agent calling browser_run_code with generated code.
 */

export const LOCALE_FILTERS = [
  ["/he/", "he"],
  ["/fr/", "fr"],
  ["/it/", "it"],
  ["/ru/", "ru"],
  ["/ja/", "ja"],
  ["/ko/", "ko"],
  ["/zh/", "zh"],
  ["/hy/", "hy"],
  ["/fil/", "fil"],
  ["/az/", "az"],
  ["/be/", "be"],
  ["/am/", "am"],
  ["/as/", "as"],
  ["/bn/", "bn"],
  ["/bs/", "bs"],
  ["/eu/", "eu"],
  ["/af/", "af"],
  ["/ak/", "ak"],
  ["/ro/", "ro"],
  ["/sq/", "sq"],
  ["/nl/", "nl"],
  ["/pl/", "pl"],
  ["/tr/", "tr"],
];

export const PATH_FILTERS = [
  ["/collections/", "collections"],
  ["/pages/", "pages"],
  ["/blogs/", "blogs"],
  ["/search", "search"],
];

export const ALL_FILTERS = [...LOCALE_FILTERS, ...PATH_FILTERS];
