"use client";

import { useMemo, useState } from "react";

type TabId = "idea2" | "idea3" | "idea4";
type SortValue = "title-asc" | "title-desc" | "upc-asc" | "upc-desc";
type SectionValue = "women" | "men" | "jeans";
type RuleField = "itemType" | "title" | "sku" | "upc";

type MenuNode = {
  key: string;
  label: string;
  parent: string | null;
  depth: number;
};

type ProductRow = {
  id: string;
  title: string;
  sku: string;
  upc: string;
  itemType: string;
  image: string;
};

type Rule = {
  field: RuleField;
  value: string;
  nodeKey: string;
};

type QueueItem = {
  productId: string;
  title: string;
  upc: string;
  nodeKey: string;
  confidence: number;
};

const collectionsCount = 82;

const menuNodes: MenuNode[] = [
  { key: "women", label: "WOMEN", parent: null, depth: 0 },
  { key: "women/new-now", label: "NEW & NOW", parent: "women", depth: 1 },
  { key: "women/new-now/new-arrivals", label: "NEW ARRIVALS", parent: "women/new-now", depth: 2 },
  { key: "women/new-now/limited-edition", label: "LIMITED EDITION", parent: "women/new-now", depth: 2 },
  { key: "women/new-now/summer-sets", label: "SUMMER SETS", parent: "women/new-now", depth: 2 },
  { key: "women/new-now/winter-sets", label: "WINTER SETS", parent: "women/new-now", depth: 2 },
  { key: "women/clothing", label: "CLOTHING", parent: "women", depth: 1 },
  { key: "women/clothing/matching-sets", label: "MATCHING SETS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/dresses", label: "DRESSES", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/jeans", label: "JEANS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/shorts", label: "SHORTS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/skirts", label: "SKIRTS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/tops", label: "TOPS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/tank-tops", label: "TANK TOPS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/t-shirts", label: "T-SHIRTS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/jumpsuits-rompers", label: "JUMPSUITS & ROMPERS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/jackets-coats", label: "JACKETS & COATS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/bodysuits", label: "BODYSUITS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/tracksuits", label: "TRACKSUITS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/sweatpants", label: "SWEATPANTS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/pants-leggings", label: "PANTS & LEGGINGS", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/sweatshirts-hoodies", label: "SWEATSHIRTS & HOODIES", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/swimwear", label: "SWIMWEAR", parent: "women/clothing", depth: 2 },
  { key: "women/clothing/sweaters", label: "SWEATERS", parent: "women/clothing", depth: 2 },
  { key: "women/accessories-shoes", label: "ACCESSORIES & SHOES", parent: "women", depth: 1 },
  { key: "women/accessories-shoes/jewelry", label: "JEWELRY", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/sunglasses", label: "SUNGLASSES", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/belts", label: "BELTS", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/hats", label: "HATS", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/shoes", label: "SHOES", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/fragrance-beauty", label: "FRAGRANCE & BEAUTY", parent: "women/accessories-shoes", depth: 2 },
  { key: "women/accessories-shoes/all-accessories", label: "ALL ACCESSORIES", parent: "women/accessories-shoes", depth: 2 },
  { key: "men", label: "MEN", parent: null, depth: 0 },
  { key: "men/new-now", label: "NEW & NOW", parent: "men", depth: 1 },
  { key: "men/new-now/new-arrivals", label: "NEW ARRIVALS", parent: "men/new-now", depth: 2 },
  { key: "men/new-now/summer-sets", label: "SUMMER SETS", parent: "men/new-now", depth: 2 },
  { key: "men/new-now/winter-sets", label: "WINTER SETS", parent: "men/new-now", depth: 2 },
  { key: "men/clothing", label: "CLOTHING", parent: "men", depth: 1 },
  { key: "men/clothing/jeans", label: "JEANS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/baggy", label: "BAGGY", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/super-skinny-jeans", label: "SUPER SKINNY JEANS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/skinny-jeans", label: "SKINNY JEANS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/slim-jeans", label: "SLIM JEANS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/shirts", label: "SHIRTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/dress-shirt", label: "DRESS SHIRT", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/denim-shirts", label: "DENIM SHIRTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/linen-shirts", label: "LINEN SHIRTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/graphic-t-shirts-summer", label: "GRAPHIC T-SHIRTS (SUMMER)", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/graphic-t-shirts-winter", label: "GRAPHIC T-SHIRTS (WINTER)", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/t-shirts", label: "T-SHIRTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/tank-tops", label: "TANK TOPS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/tops", label: "TOPS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/shorts", label: "SHORTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/pants", label: "PANTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/jackets-coats", label: "JACKETS & COATS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/tracksuits", label: "TRACKSUITS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/sweatpants", label: "SWEATPANTS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/sweatshirts-hoodies", label: "SWEATSHIRTS & HOODIES", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/overalls", label: "OVERALLS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/swimwear", label: "SWIMWEAR", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/sweaters", label: "SWEATERS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/polos", label: "POLOS", parent: "men/clothing", depth: 2 },
  { key: "men/clothing/shirt-shop", label: "SHIRT SHOP", parent: "men/clothing", depth: 2 },
  { key: "men/accessories-shoes", label: "ACCESSORIES & SHOES", parent: "men", depth: 1 },
  { key: "men/accessories-shoes/jewelry", label: "JEWELRY", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/sunglasses", label: "SUNGLASSES", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/belts", label: "BELTS", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/hats", label: "HATS", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/shoes", label: "SHOES", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/fragrance-beauty", label: "FRAGRANCE & BEAUTY", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/socks-underwear", label: "SOCKS & UNDERWEAR", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/ties", label: "TIES", parent: "men/accessories-shoes", depth: 2 },
  { key: "men/accessories-shoes/all-accessories", label: "ALL ACCESSORIES", parent: "men/accessories-shoes", depth: 2 },
  { key: "jeans", label: "JEANS", parent: null, depth: 0 },
  { key: "jeans/men", label: "MEN", parent: "jeans", depth: 1 },
  { key: "jeans/men/skinny-jeans", label: "SKINNY JEANS", parent: "jeans/men", depth: 2 },
  { key: "jeans/men/super-skinny-jeans", label: "SUPER SKINNY JEANS", parent: "jeans/men", depth: 2 },
  { key: "jeans/men/baggy", label: "BAGGY", parent: "jeans/men", depth: 2 },
  { key: "jeans/men/slim-jeans", label: "SLIM JEANS", parent: "jeans/men", depth: 2 },
  { key: "jeans/women", label: "WOMEN", parent: "jeans", depth: 1 },
  { key: "jeans/women/skinny-jeans", label: "SKINNY JEANS", parent: "jeans/women", depth: 2 },
  { key: "jeans/women/relaxed-jeans", label: "RELAXED JEANS", parent: "jeans/women", depth: 2 },
  { key: "jeans/women/flare-wide-leg-jeans", label: "FLARE & WIDE LEG JEANS", parent: "jeans/women", depth: 2 },
];

const wordsA = ["Slim", "Classic", "Street", "Premium", "Core", "Urban", "Soft", "Summer", "Modern", "Essential"];
const wordsB = ["Tee", "Shirt", "Dress", "Jacket", "Jeans", "Skirt", "Top", "Pants", "Hoodie", "Shorts"];
const wordsC = ["White", "Black", "Navy", "Olive", "Gray", "Beige", "Rose", "Green", "Stone", "Blue"];

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getAncestors(key: string, nodeMap: Map<string, MenuNode>) {
  const out: string[] = [];
  let current = nodeMap.get(key)?.parent || null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = nodeMap.get(current)?.parent || null;
  }
  return out;
}

function matchesRule(row: ProductRow, rule: Rule) {
  const text = rule.value.toLowerCase();
  if (rule.field === "itemType") return row.itemType.toLowerCase().includes(text);
  if (rule.field === "title") return row.title.toLowerCase().includes(text);
  if (rule.field === "sku") return row.sku.toLowerCase().startsWith(text);
  if (rule.field === "upc") return row.upc.toLowerCase().startsWith(text);
  return false;
}

export default function ShopifyCollectionMapping() {
  const [tab, setTab] = useState<TabId>("idea3");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSort, setGlobalSort] = useState<SortValue>("title-asc");
  const [section, setSection] = useState<SectionValue>("women");
  const [idea3ActiveNode, setIdea3ActiveNode] = useState<string>("women/clothing/matching-sets");
  const [idea3SelectedRows, setIdea3SelectedRows] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [ruleField, setRuleField] = useState<RuleField>("itemType");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleNodeKey, setRuleNodeKey] = useState(menuNodes[0]?.key || "");

  const products = useMemo<ProductRow[]>(() => {
    const out: ProductRow[] = [];
    for (let i = 1; i <= 120; i += 1) {
      out.push({
        id: `p-${i}`,
        title: `${wordsA[Math.floor(seeded(i * 1.8) * wordsA.length)]} ${wordsB[Math.floor(seeded(i * 2.2) * wordsB.length)]} ${wordsC[Math.floor(seeded(i * 3.1) * wordsC.length)]}`,
        sku: `SKU-${String(i).padStart(4, "0")}`,
        upc: String(800000000000 + i),
        itemType: wordsB[Math.floor(seeded(i * 2.2) * wordsB.length)],
        image: `https://picsum.photos/seed/idea3-${i}/80/80`,
      });
    }
    return out;
  }, []);

  const [assignedByProduct, setAssignedByProduct] = useState<Record<string, Set<string>>>(() => {
    const out: Record<string, Set<string>> = {};
    for (const row of products) out[row.id] = new Set<string>();
    return out;
  });

  const nodeMap = useMemo(() => new Map(menuNodes.map((node) => [node.key, node])), []);

  const filteredProducts = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    const list = products.filter((row) =>
      `${row.title} ${row.sku} ${row.upc} ${row.itemType}`.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      if (globalSort === "title-asc") return a.title.localeCompare(b.title);
      if (globalSort === "title-desc") return b.title.localeCompare(a.title);
      if (globalSort === "upc-asc") return a.upc.localeCompare(b.upc, undefined, { numeric: true });
      return b.upc.localeCompare(a.upc, undefined, { numeric: true });
    });
    return list;
  }, [globalSearch, globalSort, products]);

  const sectionNodes = useMemo(
    () => menuNodes.filter((node) => node.key === section || node.key.startsWith(`${section}/`)),
    [section]
  );

  function toggleAssign(productId: string, nodeKey: string, checked: boolean) {
    setAssignedByProduct((prev) => {
      const next: Record<string, Set<string>> = {};
      for (const [id, selected] of Object.entries(prev)) next[id] = new Set(selected);
      if (!next[productId]) next[productId] = new Set<string>();
      if (checked) {
        next[productId].add(nodeKey);
        for (const parent of getAncestors(nodeKey, nodeMap)) next[productId].add(parent);
      } else {
        next[productId].delete(nodeKey);
      }
      return next;
    });
  }

  function bulkIdea3(checked: boolean) {
    const selectedIds = Object.keys(idea3SelectedRows).filter((id) => idea3SelectedRows[id]);
    for (const productId of selectedIds) toggleAssign(productId, idea3ActiveNode, checked);
  }

  function addRule() {
    const value = ruleValue.trim();
    if (!value) return;
    setRules((prev) => [...prev, { field: ruleField, value, nodeKey: ruleNodeKey }]);
    setRuleValue("");
  }

  function generateQueue() {
    const out: QueueItem[] = [];
    for (const row of filteredProducts) {
      for (const rule of rules) {
        if (!matchesRule(row, rule)) continue;
        out.push({
          productId: row.id,
          title: row.title,
          upc: row.upc,
          nodeKey: rule.nodeKey,
          confidence: 70 + Math.floor((seeded(Number(row.upc.slice(-4))) || 0) * 29),
        });
        break;
      }
    }
    setQueue(out);
  }

  function approveQueue(index: number) {
    const item = queue[index];
    if (!item) return;
    toggleAssign(item.productId, item.nodeKey, true);
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function rejectQueue(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <main className="page">
      <section className="card hero">
        <h1>Shopify Collection Mapping — 3 Ideas In One</h1>
        <p className="muted">Single file preview: Idea #2 (Sectioned Matrix), #3 (Dual-Pane), #4 (Rules + Review Queue).</p>
        <div className="toolbar">
          <input
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Search products (title / sku / upc / type)"
          />
          <select value={globalSort} onChange={(event) => setGlobalSort(event.target.value as SortValue)}>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="upc-asc">UPC A-Z</option>
            <option value="upc-desc">UPC Z-A</option>
          </select>
          <span className="pill">Auto-parent logic ON</span>
          <span className="pill">Live Shopify sync simulated</span>
        </div>
        <div className="kpi">
          <div className="kpi-item"><span>Collections</span><strong>{collectionsCount}</strong></div>
          <div className="kpi-item"><span>Menu Nodes</span><strong>{menuNodes.length}</strong></div>
          <div className="kpi-item"><span>Products (sample)</span><strong>{products.length}</strong></div>
        </div>
      </section>

      <section className="card">
        <div className="tabs">
          <button className={tab === "idea2" ? "tab active" : "tab"} onClick={() => setTab("idea2")}>Idea #2 — Sectioned Matrix</button>
          <button className={tab === "idea3" ? "tab active" : "tab"} onClick={() => setTab("idea3")}>Idea #3 — Dual-Pane Mapper</button>
          <button className={tab === "idea4" ? "tab active" : "tab"} onClick={() => setTab("idea4")}>Idea #4 — Rules + Review Queue</button>
        </div>
      </section>

      {tab === "idea2" ? (
        <section className="card">
          <h2>Idea #2: Sectioned Matrix (Women / Men / Jeans tabs)</h2>
          <div className="toolbar">
            <button className={section === "women" ? "tab active" : "tab"} onClick={() => setSection("women")}>Women</button>
            <button className={section === "men" ? "tab active" : "tab"} onClick={() => setSection("men")}>Men</button>
            <button className={section === "jeans" ? "tab active" : "tab"} onClick={() => setSection("jeans")}>Jeans</button>
            <span className="pill">Columns: {sectionNodes.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sticky-a">IMG</th>
                  <th className="sticky-b">TITLE</th>
                  <th className="sticky-c">UPC</th>
                  {sectionNodes.map((node) => <th key={node.key}>{node.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 45).map((row) => (
                  <tr key={`i2-${row.id}`}>
                    <td className="sticky-a center"><img src={row.image} alt="" className="thumb" /></td>
                    <td className="sticky-b"><div>{row.title}</div><small>SKU {row.sku} · {row.itemType}</small></td>
                    <td className="sticky-c">{row.upc}</td>
                    {sectionNodes.map((node) => (
                      <td key={`${row.id}-${node.key}`} className="center">
                        <input type="checkbox" checked={assignedByProduct[row.id]?.has(node.key) || false} onChange={(event) => toggleAssign(row.id, node.key, event.target.checked)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "idea3" ? (
        <section className="card">
          <h2>Idea #3: Dual-Pane Mapper (Tree left, one active node column right)</h2>
          <div className="split">
            <aside className="panel">
              <h3>Menu Tree</h3>
              <p className="muted">Pick one node. Right side shows a single assignment column.</p>
              <div className="tree">
                {menuNodes.map((node) => (
                  <button key={node.key} className={idea3ActiveNode === node.key ? "node active" : "node"} style={{ paddingLeft: `${10 + node.depth * 16}px` }} onClick={() => setIdea3ActiveNode(node.key)}>
                    {node.label}
                    <small>{node.key}</small>
                  </button>
                ))}
              </div>
            </aside>
            <section className="panel">
              <div className="toolbar">
                <span className="pill">Active Node: {idea3ActiveNode}</span>
                <button className="action" onClick={() => bulkIdea3(true)}>Assign Checked Products</button>
                <button className="action" onClick={() => bulkIdea3(false)}>Unassign Checked Products</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PICK</th>
                      <th>IMG</th>
                      <th>TITLE</th>
                      <th>UPC</th>
                      <th>ASSIGNED?</th>
                      <th>CURRENT NODES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.slice(0, 55).map((row) => (
                      <tr key={`i3-${row.id}`}>
                        <td className="center">
                          <input type="checkbox" checked={Boolean(idea3SelectedRows[row.id])} onChange={(event) => setIdea3SelectedRows((prev) => ({ ...prev, [row.id]: event.target.checked }))} />
                        </td>
                        <td className="center"><img src={row.image} alt="" className="thumb" /></td>
                        <td><div>{row.title}</div><small>SKU {row.sku}</small></td>
                        <td>{row.upc}</td>
                        <td className="center">
                          <input type="checkbox" checked={assignedByProduct[row.id]?.has(idea3ActiveNode) || false} onChange={(event) => toggleAssign(row.id, idea3ActiveNode, event.target.checked)} />
                        </td>
                        <td><small>{Array.from(assignedByProduct[row.id] || []).slice(0, 6).join(", ") || "-"}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {tab === "idea4" ? (
        <section className="card">
          <h2>Idea #4: Rules-First Smart Mapping + Review Queue</h2>
          <div className="rule-row">
            <select value={ruleField} onChange={(event) => setRuleField(event.target.value as RuleField)}>
              <option value="itemType">itemType contains</option>
              <option value="title">title contains</option>
              <option value="sku">sku startsWith</option>
              <option value="upc">upc startsWith</option>
            </select>
            <input value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} placeholder="Rule value" />
            <select value={ruleNodeKey} onChange={(event) => setRuleNodeKey(event.target.value)}>
              {menuNodes.map((node) => (
                <option key={`rule-${node.key}`} value={node.key}>{`${" ".repeat(node.depth * 2)}${node.label} (${node.key})`}</option>
              ))}
            </select>
            <button className="action" onClick={addRule}>Add Rule</button>
          </div>
          <div className="rule-list">
            {rules.length < 1 ? (
              <p className="muted">No rules yet.</p>
            ) : (
              rules.map((rule, index) => (
                <div key={`rule-${index}`} className="rule-item">
                  <span>Rule {index + 1}</span>
                  <span>{`${rule.field} -> "${rule.value}"`}</span>
                  <span>{rule.nodeKey}</span>
                  <button className="danger" onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
                </div>
              ))
            )}
          </div>
          <div className="toolbar">
            <button className="action" onClick={generateQueue}>Generate Suggestions Queue</button>
            <span className="pill">Queue: {queue.length}</span>
          </div>
          <div className="queue">
            {queue.length < 1 ? (
              <p className="muted">No suggestions. Add rules and generate queue.</p>
            ) : (
              queue.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="queue-item">
                  <img className="thumb" src={`https://picsum.photos/seed/${item.productId}/80/80`} alt="" />
                  <div><div>{item.title}</div><small>{`UPC ${item.upc} -> ${item.nodeKey} (${item.confidence}%)`}</small></div>
                  <button className="action" onClick={() => approveQueue(index)}>Approve</button>
                  <button className="danger" onClick={() => rejectQueue(index)}>Reject</button>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .page { max-width: 1700px; margin: 0 auto; padding: 118px 10px 26px; display: grid; gap: 12px; color: #e5e7eb; }
        .card { background: #10172a; border: 1px solid #263146; border-radius: 12px; padding: 12px; }
        h1 { font-size: 2rem; margin: 0 0 8px; letter-spacing: .01em; }
        h2 { font-size: 1rem; margin: 0; }
        h3 { margin: 0 0 4px; font-size: .85rem; }
        p { margin: 0; }
        .muted, small { color: #91a0ba; font-size: .75rem; }
        .hero { padding: 14px; }
        .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
        input, select { min-height: 34px; border-radius: 8px; border: 1px solid #2d3a51; background: #091024; color: #dbe4f5; padding: 0 10px; font-size: .78rem; }
        input { min-width: 260px; flex: 1 1 260px; }
        .pill { display: inline-flex; align-items: center; border: 1px solid #1f6e4b; background: #12422f; color: #9cf7d2; border-radius: 999px; min-height: 27px; padding: 0 10px; font-size: .68rem; font-weight: 700; }
        .kpi { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
        .kpi-item { min-width: 130px; border: 1px solid #2c3952; border-radius: 8px; background: #0a1328; padding: 8px 10px; display: grid; gap: 4px; }
        .kpi-item span { color: #91a0ba; font-size: .68rem; }
        .kpi-item strong { font-size: .95rem; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .tab { min-height: 34px; border-radius: 8px; border: 1px solid #35435e; background: #0a1326; color: #c8d5eb; font-size: .74rem; padding: 0 10px; cursor: pointer; }
        .tab.active { border-color: #3cb5ee; background: #0b2538; color: #e6f7ff; }
        .table-wrap { overflow: auto; border: 1px solid #2a3650; border-radius: 10px; margin-top: 10px; max-height: 64vh; background: #0a1326; }
        table { width: 100%; min-width: 1000px; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #1f2a40; padding: 7px 8px; white-space: nowrap; font-size: .75rem; text-align: left; }
        th { position: sticky; top: 0; z-index: 2; background: #0b1429; color: #c5d4eb; font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; }
        .sticky-a { position: sticky; left: 0; z-index: 3; background: #0b1429; }
        .sticky-b { position: sticky; left: 52px; z-index: 3; background: #0b1429; }
        .sticky-c { position: sticky; left: 300px; z-index: 3; background: #0b1429; }
        .center { text-align: center; }
        .thumb { width: 30px; height: 30px; object-fit: cover; border-radius: 6px; border: 1px solid #3d4962; }
        .split { display: grid; grid-template-columns: 330px 1fr; gap: 10px; margin-top: 10px; }
        .panel { border: 1px solid #2a3550; border-radius: 10px; background: #0a1327; padding: 10px; }
        .tree { margin-top: 8px; max-height: 56vh; overflow: auto; border: 1px solid #2c3853; border-radius: 8px; padding: 6px; display: grid; gap: 4px; }
        .node { min-height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #dde7fa; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; font-size: .73rem; }
        .node.active { border-color: #3caee7; background: #103349; color: #e6f8ff; }
        .action, .danger { min-height: 32px; border-radius: 8px; border: 1px solid #1f7e5a; background: linear-gradient(180deg, #1a6f52 0%, #14553f 100%); color: #defeed; font-size: .72rem; padding: 0 10px; font-weight: 700; cursor: pointer; }
        .danger { border-color: #88313a; background: linear-gradient(180deg, #5b1c27 0%, #45151f 100%); color: #ffd9dd; }
        .rule-row { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; }
        .rule-list { margin-top: 8px; display: grid; gap: 6px; }
        .rule-item, .queue-item { display: grid; grid-template-columns: 80px 1fr 1fr auto; gap: 8px; align-items: center; border: 1px solid #2d3a53; border-radius: 8px; background: #0a1328; padding: 8px; font-size: .73rem; }
        .queue { margin-top: 10px; display: grid; gap: 8px; }
        .queue-item { grid-template-columns: 34px 1fr auto auto; }
        @media (max-width: 1200px) {
          h1 { font-size: 1.45rem; }
          .split { grid-template-columns: 1fr; }
          .rule-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
