const fs = require('fs');
const path = require('path');

const logoUrl = "https://cdn.shopify.com/s/files/1/0680/6572/2620/files/Carbon_stacked_white.eps?v=1774083466";
const logoImg = \`<img src="\${logoUrl}" alt="Carbon" style={{ height: '18px', display: 'block' }} />\`;
const logoImgWidget = \`<img src="\${logoUrl}" alt="Carbon" style="height: 18px; display: block;" />\`;

// 1. Update page.tsx
const pagePath = path.join(__dirname, 'app/accessibility/page.tsx');
let pageContent = fs.readFileSync(pagePath, 'utf8');

// Replace Top Header Logo
pageContent = pageContent.replace(
  /<div className={styles\.headerTopLogo}>[\s\S]*?<\/div>/,
  \`<div className={styles.headerTopLogo}>\n           \${logoImg}\n         </div>\`
);

// Replace Brand Row Logo
pageContent = pageContent.replace(
  /<div className={styles\.brandLeft}>[\s\S]*?<\/div>/,
  \`<div className={styles.brandLeft}>\n                   \${logoImg}\n                 </div>\`
);

// Replace Widget Preview Panel Logo
pageContent = pageContent.replace(
  /<div className={styles\.wpBrand}>.*?<\/div>/,
  \`<div className={styles.wpBrand}>\${logoImg}</div>\`
);

fs.writeFileSync(pagePath, pageContent, 'utf8');

// 2. Update widget route.ts
const routePath = path.join(__dirname, 'app/accessibility/widget/route.ts');
let routeContent = fs.readFileSync(routePath, 'utf8');

routeContent = routeContent.replace(
  /<div class="carbon-a11y-brand".*?>[\s\S]*?<\/div>/g,
  \`<div class="carbon-a11y-brand">\${logoImgWidget}</div>\`
);

fs.writeFileSync(routePath, routeContent, 'utf8');

console.log("Updated logos.");
