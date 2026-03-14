import { chromium } from "playwright";

const out = {};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });

const isVisibleFn = `(${function isVisible(el) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
}.toString()})`;

try {
  await page.goto("http://localhost:3000/studio/shopify-collection-mapping", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const add = Array.from(document.querySelectorAll("button")).find((b) => /add menu item/i.test((b.textContent || "").trim()) && isVisible(b));
    if (add) add.click();
  });
  await page.waitForTimeout(800);

  // Click category selector showing current value (Collection)
  await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const candidate = Array.from(document.querySelectorAll("button,div,[role='button'],[role='combobox']"))
      .filter(isVisible)
      .find((el) => (el.textContent || "").trim() === "Collection");
    if (candidate) candidate.click();
  });
  await page.waitForTimeout(600);

  out.categories = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const tokens = ["Collections", "Products", "Pages", "Blogs", "Collection", "Product", "Page", "Blog"];
    const visibleNodes = Array.from(document.querySelectorAll("button,div,li,[role='option'],[role='menuitem']")).filter(isVisible);
    const found = [];
    for (const t of tokens) {
      if (visibleNodes.some((el) => (el.textContent || "").trim() === t)) found.push(t);
    }
    return found;
  });

  out.categoriesInAnyText = await page.evaluate(() => {
    const txt = (document.documentElement?.textContent || "").toLowerCase();
    const check = ["collections", "products", "pages", "blogs", "collection", "product", "page", "blog"];
    return check.filter((k) => txt.includes(k));
  });

  out.linkBefore = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const link = Array.from(document.querySelectorAll("input,textarea")).filter(isVisible).sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    return link ? String(link.value || "") : null;
  });

  out.dropdownVisual = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const input = Array.from(document.querySelectorAll("input,textarea"))
      .filter(isVisible)
      .find((el) => /search shopify assets/i.test(el.getAttribute("placeholder") || ""));
    if (!input) return { panelFound: false };
    const row = Array.from(document.querySelectorAll("button,div,li,[role='option']"))
      .filter(isVisible)
      .find((el) => {
        const t = (el.textContent || "").trim();
        const r = el.getBoundingClientRect();
        return t.length > 3 && r.width > 180 && r.height < 40 && r.top > input.getBoundingClientRect().bottom - 4;
      });
    if (!row) return { panelFound: false };
    let panel = row.parentElement;
    while (panel) {
      const r = panel.getBoundingClientRect();
      if (r.width > 240 && r.height > 120) break;
      panel = panel.parentElement;
    }
    if (!panel) return { panelFound: false };
    const pr = panel.getBoundingClientRect();
    const topEl = document.elementFromPoint(Math.floor(pr.left + 20), Math.floor(pr.top + 20));
    const bg = getComputedStyle(panel).backgroundColor;
    const nodes = [row, ...Array.from(panel.querySelectorAll("*"))].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.height <= 24;
    });
    const maxFont = nodes
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((n) => Number.isFinite(n))
      .reduce((m, n) => Math.max(m, n), 0);
    return {
      panelFound: true,
      inFront: !!topEl && (topEl === panel || panel.contains(topEl)),
      background: bg,
      solidBackground: bg !== "transparent" && !/rgba\([^)]+,\s*0\s*\)/.test(bg),
      maxOptionishFontPx: maxFont || null,
    };
  });

  await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const p = Array.from(document.querySelectorAll("button,div,li,[role='option'],[role='menuitem']"))
      .filter(isVisible)
      .find((el) => ["Products", "Product"].includes((el.textContent || "").trim()));
    if (p) p.click();
  });
  await page.waitForTimeout(500);

  out.linkAfterCategory = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const link = Array.from(document.querySelectorAll("input,textarea")).filter(isVisible).sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    return link ? String(link.value || "") : null;
  });

  out.linkChangedOnCategory = (out.linkBefore ?? "") !== (out.linkAfterCategory ?? "");

  await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const input = Array.from(document.querySelectorAll("input,textarea"))
      .filter(isVisible)
      .find((el) => /search shopify assets/i.test(el.getAttribute("placeholder") || ""));
    if (input) input.click();
  });
  await page.waitForTimeout(400);

  const optionPick = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const input = Array.from(document.querySelectorAll("input,textarea"))
      .filter(isVisible)
      .find((el) => /search shopify assets/i.test(el.getAttribute("placeholder") || ""));
    if (!input) return { picked: null };
    const ir = input.getBoundingClientRect();
    const option = Array.from(document.querySelectorAll("button,div,li,[role='option']"))
      .filter(isVisible)
      .find((el) => {
        const t = (el.textContent || "").trim();
        const r = el.getBoundingClientRect();
        if (["Cancel", "Add Item", "CancelAdd Item"].includes(t)) return false;
        return (
          t.length > 3 &&
          r.width > 180 &&
          r.height < 40 &&
          r.top >= ir.bottom - 2 &&
          r.left >= ir.left - 8 &&
          r.right <= ir.right + 8
        );
      });
    if (!option) return { picked: null };
    const picked = (option.textContent || "").trim().slice(0, 80);
    option.click();
    return { picked };
  });
  out.pickedOption = optionPick.picked;
  await page.waitForTimeout(500);

  out.linkAfterOption = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const link = Array.from(document.querySelectorAll("input,textarea")).filter(isVisible).sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    return link ? String(link.value || "") : null;
  });
  out.linkChangedOnOptionPick = (out.linkBefore ?? "") !== (out.linkAfterOption ?? "");

  await page.screenshot({ path: "tmp-shopify-category-check.png", fullPage: true });
} catch (e) {
  out.error = String(e?.stack || e);
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
