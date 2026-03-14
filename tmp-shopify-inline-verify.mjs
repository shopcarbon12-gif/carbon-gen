async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return await import("playwright-core");
  }
}

const result = {
  step1: {
    firstColumnPx: null,
    inlineStyle: "",
    pass: false,
  },
  step2: {
    enteredInlineEdit: false,
    dropdownInFront: false,
    dropdownFullyVisible: false,
    categoriesPresent: false,
    switchedToResultsView: false,
    selectedItemUpdatedLinkInput: false,
    details: {},
  },
  errors: [],
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });

try {
  await page.goto("http://localhost:3000/studio/shopify-collection-mapping", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(4000);
  await page.waitForSelector(".grid2", { timeout: 15000 });

  const divider = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    const candidate = all.find((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (cs.cursor || "").includes("col-resize") && r.height > 120 && r.width >= 8;
    });
    if (!candidate) return null;
    const r = candidate.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  if (divider) {
    await page.mouse.move(divider.x, divider.y);
    await page.mouse.down();
    await page.mouse.move(0, divider.y, { steps: 40 });
    await page.mouse.up();
    await page.waitForTimeout(600);
  }

  result.step1 = await page.evaluate(() => {
    const g = document.querySelector(".grid2");
    if (!g) return { firstColumnPx: null, inlineStyle: "", pass: false };
    const inlineStyle = g.getAttribute("style") || "";
    const computed = getComputedStyle(g).gridTemplateColumns || "";
    const fromInline = inlineStyle.match(/grid-template-columns:\s*(\d+(?:\.\d+)?)px/i)?.[1] || null;
    const fromComputed = computed.match(/(\d+(?:\.\d+)?)px/)?.[1] || null;
    const firstColumnPx = Number(fromInline || fromComputed || NaN);
    return {
      firstColumnPx: Number.isFinite(firstColumnPx) ? firstColumnPx : null,
      inlineStyle,
      computed,
      pass: Number.isFinite(firstColumnPx) ? firstColumnPx >= 340 : false,
    };
  });

  const rowDiagnostics = await page.evaluate(() => {
    const rows = document.querySelectorAll(".treeRow").length;
    const editButtons = document.querySelectorAll('button[aria-label="Edit menu item"]').length;
    const visibleRows = Array.from(document.querySelectorAll(".treeRow"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
      })
      .length;
    return { rows, editButtons, visibleRows };
  });
  result.step2.details.treeRows = rowDiagnostics.rows;
  result.step2.details.visibleTreeRows = rowDiagnostics.visibleRows;
  result.step2.details.editButtons = rowDiagnostics.editButtons;

  let editClicked = false;
  if (rowDiagnostics.editButtons > 0) {
    editClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Edit menu item"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(400);
  }
  result.step2.details.editClicked = editClicked;

  const editingRowLocator = page.locator(".treeRow.editing");
  try {
    await editingRowLocator.first().waitFor({ state: "visible", timeout: 4000 });
  } catch {
    // Leave as failed state; include diagnostics in output.
  }
  result.step2.enteredInlineEdit = (await editingRowLocator.count()) > 0;

  if (!result.step2.enteredInlineEdit) {
    await page.screenshot({ path: "tmp-shopify-inline-verify-latest.png", fullPage: true });
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(0);
  }

  const rightLinkInput = page.locator(".treeRow.editing .treeInlineInputLinkTrigger").first();
  const beforeValue = await rightLinkInput.inputValue();
  await rightLinkInput.click();
  let pickerOpened = true;
  try {
    await page.waitForSelector(".treeInlineLinkPickerPortal", { timeout: 8000 });
  } catch {
    pickerOpened = false;
  }
  result.step2.details.pickerOpened = pickerOpened;
  if (!pickerOpened) {
    await page.screenshot({ path: "tmp-shopify-inline-verify-latest.png", fullPage: true });
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(0);
  }
  await page.waitForTimeout(200);

  const pickerState = await page.evaluate(() => {
    const panel = document.querySelector(".treeInlineLinkPickerPortal");
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    const viewportOk = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;

    const pointX = Math.floor(r.left + Math.min(30, Math.max(6, r.width / 8)));
    const pointY = Math.floor(r.top + Math.min(30, Math.max(6, r.height / 8)));
    const topEl = document.elementFromPoint(pointX, pointY);
    const inFront = !!topEl && (topEl === panel || panel.contains(topEl));

    const categoryTexts = Array.from(panel.querySelectorAll(".treeInlineLinkCategoryOption"))
      .map((el) => (el.textContent || "").replace("›", "").trim())
      .filter(Boolean);
    const expected = ["Collections", "Products", "Pages", "Blogs"];
    const categoriesPresent = expected.every((t) => categoryTexts.includes(t));

    return {
      viewportOk,
      inFront,
      categoryTexts,
      categoriesPresent,
    };
  });

  if (pickerState) {
    result.step2.dropdownFullyVisible = !!pickerState.viewportOk;
    result.step2.dropdownInFront = !!pickerState.inFront;
    result.step2.categoriesPresent = !!pickerState.categoriesPresent;
    result.step2.details.categoryTexts = pickerState.categoryTexts;
  }

  const productsBtn = page.locator(".treeInlineLinkPickerPortal .treeInlineLinkCategoryOption", { hasText: "Products" }).first();
  const hasProducts = (await productsBtn.count()) > 0;
  if (hasProducts) {
    await productsBtn.click();
    await page.waitForTimeout(300);
  }

  const hasBack = (await page.locator(".treeInlineLinkPickerPortal .treeInlineLinkBackBtn").count()) > 0;
  const hasSearch = (await page.locator(".treeInlineLinkPickerPortal .treeInlineLinkSearch").count()) > 0;
  const optionCount = await page.locator(".treeInlineLinkPickerPortal .treeInlineLinkOption").count();
  result.step2.details.resultsOptionCount = optionCount;
  result.step2.switchedToResultsView = hasBack && hasSearch && optionCount > 0;

  if (optionCount > 0) {
    const firstOption = page.locator(".treeInlineLinkPickerPortal .treeInlineLinkOption").first();
    const pickedText = ((await firstOption.innerText()) || "").trim();
    await firstOption.click();
    await page.waitForTimeout(300);
    const afterValue = await rightLinkInput.inputValue();
    result.step2.details.selectedItem = pickedText;
    result.step2.details.beforeLinkValue = beforeValue;
    result.step2.details.afterLinkValue = afterValue;
    result.step2.selectedItemUpdatedLinkInput = afterValue.trim().length > 0 && afterValue !== beforeValue;
  } else {
    result.step2.details.beforeLinkValue = beforeValue;
  }

  await page.screenshot({ path: "tmp-shopify-inline-verify-latest.png", fullPage: true });
} catch (error) {
  result.errors.push(String(error && error.stack ? error.stack : error));
}

await browser.close();
console.log(JSON.stringify(result, null, 2));
