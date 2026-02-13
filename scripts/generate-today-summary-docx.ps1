$OutputPath = "D:\Projects\My project\carbon-gen\Today_Changes_Summary_2026-02-12_13.docx"
$Title = "Carbon Gen - Changes Summary (Feb 12-13, 2026)"
$NowLocal = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$NowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$lines = @(
  $Title,
  "",
  "Scope",
  "This document summarizes the key updates completed today across local and web app (Vercel production).",
  "",
  "1) Generation Reliability and Quality",
  "- Added stricter back-view fidelity lock so back-facing outputs must match item-reference back design (no invented/replaced back graphics).",
  "- Added clearer client handling for generation network failures: one automatic retry for /api/generate and improved error messages instead of generic 'Failed to fetch'.",
  "- Enforced split-output normalization to target frame for 2:3 results (770 x 1155 per side), with preview consistency fixes.",
  "- Added/kept strong white-background consistency guardrails in generation prompt/QA flow.",
  "",
  "2) Dropbox Barcode Search",
  "- Fixed Dropbox search root handling: when configured root is invalid, API now resolves to a valid root and falls back correctly.",
  "- Validated and aligned search root to /Carbon for this account context.",
  "- Improved recursive/folder result handling so barcode search returns expected folder/image matches more reliably.",
  "",
  "3) Shopify Push and Variants Workflow",
  "- Added color-level variant mapping model (main color cards).",
  "- Implemented drag/drop assignment for generated images to color variants.",
  "- Push behavior applies assigned image across variants of that color.",
  "- Added mapping preview block for transparency before push.",
  "- Added alt-text generation workflow improvements and missing-alt fill behavior.",
  "",
  "4) Studio UX and Flow Improvements",
  "- Updated item reference picker behavior and catalog interactions (including separate file/folder picker variants where requested).",
  "- Added pagination behavior for empty catalog search flows and status filtering logic updates in prior commits today.",
  "- Added business rule: female + dress blocks panel 3 generation path.",
  "",
  "5) Local Runtime/Port Stabilization (Port 3000)",
  "- Removed old auto-start background tasks from legacy C: setup (user-run in admin shell).",
  "- Kept local app configured on port 3000 in .env.local.",
  "- Improved start-local script logic to detect stale listeners and avoid false early startup failure.",
  "- Added startup shortcut under current user Startup folder to launch the D: project local stack at login.",
  "",
  "6) Deployments",
  "- Production alias updated multiple times today after fixes.",
  "- Current production URL: https://carbon-gen-iota.vercel.app",
  "",
  "Key Commits (latest to earlier)",
  "- 09cd358: Retry generate API once and improve failed-fetch error clarity",
  "- 4651c09: Enforce strict back-design fidelity for back-facing panel poses",
  "- 75f055f: Fix Dropbox barcode search root resolution fallback",
  "- 7b9927b: Normalize split outputs to 770x1155 and fix split preview aspect",
  "- d2a1859: Add push mapping preview for color to image assignments",
  "- 3411bdc: Auto-load current Shopify media on search and color-level variant assignment",
  "- 0f55609: Use color-main variant cards and apply assignments to all variants per color",
  "- c1dd2e2: Split item references picker into separate files and folder buttons",
  "- 9cf53e0: Add drag-drop variant image mapping and variant pull/order in Shopify Push",
  "- c8cb0ba: Disable female panel 3 for dress item type",
  "",
  "Current Note",
  "- scripts/start-local-stack.ps1 has local uncommitted changes for startup hardening on this machine.",
  "",
  "Generated: $NowLocal"
)

function Escape-Xml([string]$s) {
  if ($null -eq $s) { return "" }
  return $s.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;").Replace('"',"&quot;").Replace("'","&apos;")
}

$paragraphs = ($lines | ForEach-Object { "<w:p><w:r><w:t xml:space=`"preserve`">$(Escape-Xml $_)</w:t></w:r></w:p>" }) -join "`n"

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
  <w:body>
$paragraphs
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@

$rels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>$(Escape-Xml $Title)</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$NowUtc</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$NowUtc</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
</Properties>
"@

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }
$fs = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    $entries = @{
      "[Content_Types].xml" = $contentTypes
      "_rels/.rels" = $rels
      "word/document.xml" = $documentXml
      "docProps/core.xml" = $coreXml
      "docProps/app.xml" = $appXml
    }
    foreach ($k in $entries.Keys) {
      $entry = $zip.CreateEntry($k)
      $writer = New-Object System.IO.StreamWriter($entry.Open(), [System.Text.Encoding]::UTF8)
      $writer.Write($entries[$k])
      $writer.Dispose()
    }
  } finally {
    $zip.Dispose()
  }
} finally {
  $fs.Dispose()
}

Write-Host $OutputPath
