const fs = require('fs');
const path = require('path');

const tsxPath = path.join(__dirname, 'app/accessibility/page.tsx');
let tsxContent = fs.readFileSync(tsxPath, 'utf8');

// Normalize CRLF to LF for safe searching
const normalizedContent = tsxContent.replace(/\r\n/g, '\n');
const anchor = '  return (\n    <main className={styles.page}>';
const idx = normalizedContent.indexOf(anchor);

if (idx === -1) {
  console.error("COULD NOT FIND STRICT ANCHOR IN PAGE.TSX");
  process.exit(1);
}

// Substring the original content using the character index (which is fine since we replace back)
// Wait, if we use normalizedContent.indexOf, the index is off by the number of \r removed.
// Better to match using a Regex!
const match = tsxContent.match(/  return \(\s*<main className={styles\.page}>/);
if (!match) {
  console.error("Regex could not find anchor.");
  process.exit(1);
}

const finalIdx = match.index;
const headerPart = tsxContent.substring(0, finalIdx);
const jsxPayload = fs.readFileSync(path.join(__dirname, 'update_page_jsx.txt'), 'utf8');

fs.writeFileSync(tsxPath, headerPart + jsxPayload, 'utf8');
console.log("SUCCESS");
