const fs = require('fs');
const path = require('path');

const tsxPath = path.join(__dirname, 'app/accessibility/page.tsx');
let tsxContent = fs.readFileSync(tsxPath, 'utf8');

const anchor = '  return (';
const idx = tsxContent.indexOf(anchor);

if (idx === -1) {
  console.error("COULD NOT FIND ANCHOR IN PAGE.TSX");
  process.exit(1);
}

const headerPart = tsxContent.substring(0, idx);
const jsxPayload = fs.readFileSync(path.join(__dirname, 'update_page_jsx.txt'), 'utf8');

fs.writeFileSync(tsxPath, headerPart + jsxPayload, 'utf8');
console.log("SUCCESS");
