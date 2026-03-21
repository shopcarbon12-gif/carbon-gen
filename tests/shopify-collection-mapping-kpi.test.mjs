import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const helperSource = await readFile(new URL("../lib/shopifyCollectionMappingKpi.ts", import.meta.url), "utf8");
const helperCode = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const helper = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(helperCode)}`);

const {
  KPI_NEEDS_REVIEW_UNION_FILTER,
  classifyShopifyCollectionMappingRow,
  isNeedsReviewRow,
  isPendingPushRow,
  isPushFailedRow,
  isSyncedRow,
  matchesShopifyCollectionMappingQueueTab,
  summarizeShopifyCollectionMappingWorkflows,
} = helper;

const cases = [
  {
    name: "needsReview only",
    input: {
      mappingDecision: "MANUAL_REVIEW",
      collectionSyncStatus: "REVIEW",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "suggestionReady only",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "",
      suggestionReady: true,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "manualChanges only",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: true,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "ADD_PENDING only",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "PROCESSED",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: true,
      pushFailed: false,
      synced: false,
      statusLabel: "Ready to Push",
    },
  },
  {
    name: "REMOVAL_PENDING only",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "REMOVAL_PENDING",
      actionStatus: "PROCESSED",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: true,
      pushFailed: false,
      synced: false,
      statusLabel: "Ready to Push",
    },
  },
  {
    name: "FAILED action",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "FAILED",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: false,
      pushFailed: true,
      synced: false,
      statusLabel: "Push Failed",
    },
  },
  {
    name: "strict SYNCED unreviewed",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "PROCESSED",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: false,
      pushFailed: false,
      synced: true,
      statusLabel: "Synced",
    },
  },
  {
    name: "strict SYNCED reviewed",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "PROCESSED",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: false,
      pushFailed: false,
      synced: true,
      statusLabel: "Synced",
    },
  },
  {
    name: "suggestion-ready unreviewed stays Needs Review",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "",
      suggestionReady: true,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "manual change unreviewed stays Needs Review",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: true,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "ADD_PENDING plus suggestionReady",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "PROCESSED",
      suggestionReady: true,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "ADD_PENDING plus manualChanges",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "PROCESSED",
      suggestionReady: false,
      manualChanges: true,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "MANUAL_REVIEW plus ADD_PENDING conflict",
    input: {
      mappingDecision: "MANUAL_REVIEW",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "visible suggestions stay Needs Review",
    input: {
      mappingDecision: "SUGGESTED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "",
      suggestionReady: true,
      manualChanges: false,
      isReviewed: false,
    },
    expected: {
      loaded: true,
      needsReview: true,
      pendingPush: false,
      pushFailed: false,
      synced: false,
      statusLabel: "Needs Review",
    },
  },
  {
    name: "reviewed unresolved suggestion row is ready to push",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "",
      suggestionReady: true,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: true,
      pushFailed: false,
      synced: false,
      statusLabel: "Ready to Push",
    },
  },
  {
    name: "reviewed unresolved row is ready to push",
    input: {
      mappingDecision: "MANUAL_REVIEW",
      collectionSyncStatus: "REVIEW",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: true,
      pushFailed: false,
      synced: false,
      statusLabel: "Ready to Push",
    },
  },
  {
    name: "finalized pending delta with no unresolved flags",
    input: {
      mappingDecision: "SUGGESTED",
      collectionSyncStatus: "ADD_PENDING",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: true,
      pushFailed: false,
      synced: false,
      statusLabel: "Ready to Push",
    },
  },
  {
    name: "already-correct row is synced without processed flag",
    input: {
      mappingDecision: "AUTO_MAPPED",
      collectionSyncStatus: "SYNCED",
      actionStatus: "",
      suggestionReady: false,
      manualChanges: false,
      isReviewed: false,
      currentMatchesFinal: true,
    },
    expected: {
      loaded: true,
      needsReview: false,
      pendingPush: false,
      pushFailed: false,
      synced: true,
      statusLabel: "Synced",
    },
  },
];

test("conflictSignals alone requires human eye like suggestions", () => {
  const workflow = classifyShopifyCollectionMappingRow({
    mappingDecision: "AUTO_MAPPED",
    collectionSyncStatus: "SYNCED",
    actionStatus: "",
    suggestionReady: false,
    conflictSignals: true,
    manualChanges: false,
    isReviewed: false,
  });
  assert.equal(workflow.needsReview, true);
  assert.equal(workflow.conflictSignals, true);
  assert.equal(matchesShopifyCollectionMappingQueueTab("suggestion-ready", workflow), true);
});

test("row classification matches the business rules for the KPI buckets", () => {
  for (const rowCase of cases) {
    const workflow = classifyShopifyCollectionMappingRow(rowCase.input);

    assert.equal(true, rowCase.expected.loaded, `${rowCase.name}: loaded baseline`);
    assert.equal(isNeedsReviewRow(workflow), rowCase.expected.needsReview, `${rowCase.name}: needsReview`);
    assert.equal(isPendingPushRow(workflow), rowCase.expected.pendingPush, `${rowCase.name}: pendingPush`);
    assert.equal(isPushFailedRow(workflow), rowCase.expected.pushFailed, `${rowCase.name}: pushFailed`);
    assert.equal(isSyncedRow(workflow), rowCase.expected.synced, `${rowCase.name}: synced`);
    assert.equal(workflow.statusLabel, rowCase.expected.statusLabel, `${rowCase.name}: statusLabel`);

    assert.equal(matchesShopifyCollectionMappingQueueTab("all", workflow), true, `${rowCase.name}: loaded filter`);
    assert.equal(matchesShopifyCollectionMappingQueueTab(KPI_NEEDS_REVIEW_UNION_FILTER, workflow), rowCase.expected.needsReview, `${rowCase.name}: needs review KPI filter`);
    assert.equal(matchesShopifyCollectionMappingQueueTab("ready-push", workflow), rowCase.expected.pendingPush, `${rowCase.name}: pending push filter`);
    assert.equal(matchesShopifyCollectionMappingQueueTab("push-failed", workflow), rowCase.expected.pushFailed, `${rowCase.name}: push failed filter`);
    assert.equal(matchesShopifyCollectionMappingQueueTab("synced", workflow), rowCase.expected.synced, `${rowCase.name}: synced filter`);
  }
});

test("KPI summary counts match filtered result sets", () => {
  const workflows = cases.map((rowCase) => classifyShopifyCollectionMappingRow(rowCase.input));
  const summary = summarizeShopifyCollectionMappingWorkflows(workflows);
  const loadedRows = workflows.filter((workflow) => matchesShopifyCollectionMappingQueueTab("all", workflow)).length;
  const needsReviewRows = workflows.filter((workflow) =>
    matchesShopifyCollectionMappingQueueTab(KPI_NEEDS_REVIEW_UNION_FILTER, workflow)
  ).length;
  const pendingPushRows = workflows.filter((workflow) => matchesShopifyCollectionMappingQueueTab("ready-push", workflow)).length;
  const pushFailedRows = workflows.filter((workflow) => matchesShopifyCollectionMappingQueueTab("push-failed", workflow)).length;
  const syncedRows = workflows.filter((workflow) => matchesShopifyCollectionMappingQueueTab("synced", workflow)).length;

  assert.equal(summary.totalLoaded, loadedRows, "Loaded KPI matches dataset rows");
  assert.equal(summary.reviewNeeded, needsReviewRows, "Needs Review KPI matches filtered rows");
  assert.equal(summary.readyToPush, pendingPushRows, "Pending Push KPI matches filtered rows");
  assert.equal(summary.pushFailed, pushFailedRows, "Push Failed KPI matches filtered rows");
  assert.equal(summary.synced, syncedRows, "Synced KPI matches filtered rows");
});

test("unreviewed rows with suggestions or manual changes stay in needs review", () => {
  for (const rowCase of cases.filter(
    (entry) =>
      !entry.input.isReviewed &&
      (entry.input.suggestionReady || entry.input.manualChanges || entry.input.conflictSignals)
  )) {
    const workflow = classifyShopifyCollectionMappingRow(rowCase.input);
    assert.equal(workflow.needsReview, true, `${rowCase.name}: unresolved rows stay in needs review`);
    assert.equal(workflow.pendingPush, false, `${rowCase.name}: unresolved rows are not pending push`);
    assert.equal(workflow.synced, false, `${rowCase.name}: unresolved rows are not synced`);
  }
});

test("push failed rows do not leak into synced or pending push", () => {
  const workflow = classifyShopifyCollectionMappingRow({
    mappingDecision: "AUTO_MAPPED",
    collectionSyncStatus: "SYNCED",
    actionStatus: "FAILED",
    suggestionReady: false,
    manualChanges: false,
    isReviewed: true,
  });

  assert.equal(workflow.pushFailed, true);
  assert.equal(workflow.pendingPush, false);
  assert.equal(workflow.synced, false);
  assert.equal(workflow.statusLabel, "Push Failed");
});

test("approval checkbox gates only human-eye rows", () => {
  const pairs = [
    {
      name: "synced rows keep synced regardless of reviewed",
      left: {
        mappingDecision: "AUTO_MAPPED",
        collectionSyncStatus: "SYNCED",
        actionStatus: "PROCESSED",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: false,
      },
      right: {
        mappingDecision: "AUTO_MAPPED",
        collectionSyncStatus: "SYNCED",
        actionStatus: "PROCESSED",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: true,
      },
      expected: "Synced",
    },
    {
      name: "engine-clean delta rows stay ready regardless approval",
      left: {
        mappingDecision: "AUTO_MAPPED",
        collectionSyncStatus: "ADD_PENDING",
        actionStatus: "",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: false,
      },
      right: {
        mappingDecision: "AUTO_MAPPED",
        collectionSyncStatus: "ADD_PENDING",
        actionStatus: "",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: true,
      },
      expectedLeft: "Ready to Push",
      expectedRight: "Ready to Push",
    },
    {
      name: "review-required rows need approval gate",
      left: {
        mappingDecision: "MANUAL_REVIEW",
        collectionSyncStatus: "REVIEW",
        actionStatus: "",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: false,
      },
      right: {
        mappingDecision: "MANUAL_REVIEW",
        collectionSyncStatus: "REVIEW",
        actionStatus: "",
        suggestionReady: false,
        manualChanges: false,
        isReviewed: true,
      },
      expectedLeft: "Needs Review",
      expectedRight: "Ready to Push",
    },
  ];

  for (const pair of pairs) {
    const left = classifyShopifyCollectionMappingRow(pair.left);
    const right = classifyShopifyCollectionMappingRow(pair.right);
    if (pair.expected) {
      assert.equal(left.statusLabel, pair.expected, `${pair.name}: left status`);
      assert.equal(right.statusLabel, pair.expected, `${pair.name}: right status`);
      continue;
    }
    assert.equal(left.statusLabel, pair.expectedLeft, `${pair.name}: left status`);
    assert.equal(right.statusLabel, pair.expectedRight, `${pair.name}: right status`);
  }
});
