const out = { step1: {}, step2: {}, step3: {}, notes: [], errors: [] };

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return await import("playwright-core");
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });

try {
  await page.goto("http://localhost:3000/studio/shopify-collection-mapping", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(4000);

  // Step 1: drag center divider hard left and read .grid2 first column.
  out.step1.before = await page.evaluate(() => {
    const g = document.querySelector(".grid2");
    if (!g) return null;
    return { inlineStyle: g.getAttribute("style") || "", computed: getComputedStyle(g).gridTemplateColumns || "" };
  });

  const divider = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("*")).filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (cs.cursor || "").includes("col-resize") && r.height > 100 && r.width >= 8;
    });
    if (!els.length) return null;
    const r = els[0].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  out.step1.dividerFound = !!divider;
  if (divider) {
    await page.mouse.move(divider.x, divider.y);
    await page.mouse.down();
    await page.mouse.move(10, divider.y, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  }

  out.step1.after = await page.evaluate(() => {
    const g = document.querySelector(".grid2");
    if (!g) return null;
    const inlineStyle = g.getAttribute("style") || "";
    const computed = getComputedStyle(g).gridTemplateColumns || "";
    const fromInline = inlineStyle.match(/grid-template-columns:\s*(\d+(?:\.\d+)?)px/i)?.[1] || null;
    const fromComputed = computed.match(/(\d+(?:\.\d+)?)px/)?.[1] || null;
    const firstPx = Number(fromInline || fromComputed || NaN);
    return { inlineStyle, computed, firstPx: Number.isFinite(firstPx) ? firstPx : null };
  });
  out.step1.stopsAt340Min = out.step1.after?.firstPx === null ? null : out.step1.after.firstPx >= 340;

  // Try true row edit controls first.
  const rowEditOpened = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(isVisible)
      .filter((el) => /edit/i.test((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + (el.textContent || "")));
    if (!candidates.length) return false;
    candidates[0].click();
    return true;
  });
  out.step2.rowEditOpened = rowEditOpened;

  if (!rowEditOpened) {
    const addClicked = await page.evaluate(() => {
      const isVisible = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
      };
      const btn = Array.from(document.querySelectorAll("button")).find((b) => /add menu item/i.test((b.textContent || "").trim()) && isVisible(b));
      if (!btn) return false;
      btn.click();
      return true;
    });
    out.step2.usedAddMenuItemFallback = addClicked;
    if (addClicked) out.notes.push("No visible row edit button found; used Add Menu Item modal as edit path.");
  }
  await page.waitForTimeout(1000);

  // Click right-most visible Link input.
  const rightLink = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const labels = Array.from(document.querySelectorAll("label")).filter((l) => (l.textContent || "").trim() === "Link" && isVisible(l));
    const candidates = [];
    for (const l of labels) {
      const root = l.parentElement || l.closest("div");
      if (!root) continue;
      const input = root.querySelector("input,[role='combobox'],textarea");
      if (!input || !isVisible(input)) continue;
      const r = input.getBoundingClientRect();
      candidates.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.x - a.x);
    const c = candidates[0];
    return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  });
  out.step2.rightLinkFound = !!rightLink;
  if (rightLink) {
    await page.mouse.click(rightLink.x, rightLink.y);
    await page.waitForTimeout(600);
  }

  // Evaluate dropdown/panel behavior for the link picker.
  out.step2.dropdown = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };

    const categories = ["Collections", "Products", "Pages", "Blogs"];
    const singular = ["Collection", "Product", "Page", "Blog"];

    const allButtons = Array.from(document.querySelectorAll("button")).filter(isVisible);
    const foundPlural = categories.filter((c) => allButtons.some((b) => (b.textContent || "").trim() === c));
    const foundSingular = singular.filter((c) => allButtons.some((b) => (b.textContent || "").trim() === c));

    // Find open picker list by searching first visible option row under "Link" field.
    const optionRow = Array.from(document.querySelectorAll("button,li,div,[role='option']")).find((el) => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || "").trim();
      return t.length > 2 && /accessories|products|collections|new arrivals|jeans/i.test(t);
    });

    let panel = null;
    if (optionRow) {
      let node = optionRow.parentElement;
      while (node) {
        const r = node.getBoundingClientRect();
        if (r.width > 200 && r.height > 120) {
          panel = node;
          break;
        }
        node = node.parentElement;
      }
    }

    let inFront = null;
    let panelBg = null;
    let solidBackground = null;
    let maxFontPx = null;
    if (panel) {
      const r = panel.getBoundingClientRect();
      const x = Math.floor(r.left + Math.min(20, Math.max(4, r.width / 10)));
      const y = Math.floor(r.top + Math.min(20, Math.max(4, r.height / 10)));
      const topEl = document.elementFromPoint(x, y);
      inFront = !!topEl && (topEl === panel || panel.contains(topEl));
      panelBg = getComputedStyle(panel).backgroundColor;
      solidBackground = panelBg !== "transparent" && !/rgba\([^)]+,\s*0\s*\)/.test(panelBg);
      const sizes = [panel, ...Array.from(panel.querySelectorAll("*"))]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((n) => Number.isFinite(n));
      maxFontPx = sizes.length ? Math.max(...sizes) : null;
    }

    return {
      foundPlural,
      allPluralPresent: categories.every((c) => foundPlural.includes(c)),
      foundSingular,
      allSingularPresent: singular.every((c) => foundSingular.includes(c)),
      panelFound: !!panel,
      inFront,
      panelBackgroundColor: panelBg,
      solidBackground,
      maxFontPx,
    };
  });

  // Step 3: selecting category then option updates Link input text.
  out.step3 = await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const linkInput = Array.from(document.querySelectorAll("input,textarea,[role='combobox']"))
      .filter(isVisible)
      .sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    const before = linkInput ? String(linkInput.value ?? linkInput.textContent ?? "") : null;

    const productCat = Array.from(document.querySelectorAll("button")).find(
      (b) => isVisible(b) && ["Products", "Product"].includes((b.textContent || "").trim())
    );
    if (productCat) productCat.click();

    const option = Array.from(document.querySelectorAll("button,li,[role='option'],div"))
      .filter(isVisible)
      .find((el) => {
        const t = (el.textContent || "").trim();
        return t.length > 3 && !["Products", "Product", "Collections", "Collection", "Pages", "Page", "Blogs", "Blog", "Link", "Name"].includes(t);
      });
    const picked = option ? (option.textContent || "").trim().slice(0, 80) : null;
    if (option) option.click();

    const after = linkInput ? String(linkInput.value ?? linkInput.textContent ?? "") : null;
    return {
      before,
      categoryButtonFound: !!productCat,
      optionPickedLabel: picked,
      after,
      inputUpdated: (before ?? "") !== (after ?? ""),
    };
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: "tmp-shopify-collection-mapping-verify-agent.png", fullPage: true });
} catch (e) {
  out.errors.push(String(e?.stack || e));
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
