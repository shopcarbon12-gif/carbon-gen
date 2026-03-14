const { chromium } = require("playwright");

function overlaps(a, b) {
  return !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto("http://localhost:3000/studio/shopify-collection-mapping", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const editSelectors = [
    'button:has-text("Edit")',
    'button[aria-label*="Edit"]',
    'button[title*="Edit"]',
    '[data-testid*="edit"]',
  ];

  let clickedEdit = false;
  for (const sel of editSelectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        await loc.click({ timeout: 3000 });
        clickedEdit = true;
        break;
      } catch {
        // Try next selector.
      }
    }
  }

  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && r.width > 20 && r.height > 20;
    };

    const inputs = Array.from(document.querySelectorAll("input"))
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const id = el.getAttribute("id") || "";
        const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
        const nearText = el.closest("div,td,tr")?.textContent || "";
        const meta = [
          el.getAttribute("name"),
          el.getAttribute("placeholder"),
          el.getAttribute("aria-label"),
          labelEl?.textContent || "",
          nearText,
        ]
          .join(" ")
          .toLowerCase();

        return {
          meta,
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      });

    const labelInput = inputs.find((i) => i.meta.includes("label"));
    const linkInput = inputs.find((i) => i.meta.includes("link") || i.meta.includes("url"));

    return {
      visibleInputs: inputs.length,
      foundLabel: Boolean(labelInput),
      foundLink: Boolean(linkInput),
      labelInput,
      linkInput,
    };
  });

  let sideBySide = null;
  let hasOverlap = null;
  let verticalDiff = null;
  let horizontalGap = null;

  if (result.labelInput && result.linkInput) {
    verticalDiff = Math.abs(result.labelInput.y - result.linkInput.y);
    sideBySide = verticalDiff < Math.max(result.labelInput.height, result.linkInput.height) * 0.5;
    hasOverlap = overlaps(result.labelInput, result.linkInput);
    horizontalGap = result.linkInput.x - result.labelInput.right;
  }

  await page.screenshot({ path: "tmp-inline-edit-width-check-latest.png", fullPage: true });
  await browser.close();

  const payload = {
    url: "http://localhost:3000/studio/shopify-collection-mapping",
    clickedEdit,
    ...result,
    sideBySide,
    hasOverlap,
    verticalDiff,
    horizontalGap,
  };
  console.log(JSON.stringify(payload, null, 2));
})();
