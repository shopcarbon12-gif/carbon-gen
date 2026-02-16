# Shopify Mapping Inventory Operations Manual (Draft)

Version: 1.0 (Draft for Review)
Date: February 16, 2026
Owner: Carbon Jeans Company
Scope: Shopify Mapping Inventory workspace in this app

## 0. Read This First

This manual explains the full day-to-day workflow for the Shopify Mapping Inventory module.
It covers every currently implemented page and section:
- Workset
- Sales
- Inventory
- Carts Inventory
- Configurations
  - POS Configurations
  - Cart Configurations

Important control currently active:
- Sync pull on Cart Configurations is locked behind approval.
- The button is intentionally disabled and shows: Pull Mapping Data from Shopify (Approval Required).
- No real sync should be triggered until owner approval is given.

## 1. Access and Prerequisites

### 1.1 Required access
1. Sign in to the app with an account that can open Studio pages.
2. Confirm you can open this route: /studio/shopify-mapping-inventory/workset
3. Confirm sidebar shows Shopify Mapping Inventory submenu.

### 1.2 Required integrations
1. Lightspeed integration should be connected.
2. Shopify integration should be connected.
3. If either integration is offline, continue configuration first, then retry data pages.

### 1.3 Browser and session guidance
1. Use a modern Chromium browser for best UI compatibility.
2. Keep one active tab for configuration changes to avoid stale state confusion.
3. Refresh the page after major settings changes.

## 2. Navigation Structure

### 2.1 Left navigation path
1. Open Shopify Mapping Inventory.
2. Use submenu entries:
- Workset
- Sales
- Inventory
- Carts Inventory
- Configurations

### 2.2 Configurations nested submenu
1. Open Configurations.
2. Expand nested options:
- POS Configurations
- Cart Configurations

### 2.3 Quick chips across pages
Most pages include top quick chips for fast jumps between sections.
Use chips for navigation, not browser back, when performing repeated setup steps.

## 3. Workset Page Manual

Purpose: health dashboard for Lightspeed to Shopify sync readiness.

### 3.1 Open Workset
1. Go to /studio/shopify-mapping-inventory/workset
2. Verify page title Sync Operations Hub.

### 3.2 Run a health check
1. Click Run Health Check.
2. Wait for Refreshing state to finish.
3. Read the Last updated timestamp.

### 3.3 Understand KPI cards
1. Source Catalog: item count detected in Lightspeed.
2. Store Catalog: published product count in Shopify.
3. Coverage: ratio of Store Catalog vs Source Catalog.
4. Backlog Pressure: pending count percentage.

### 3.4 Read connector status panels
1. Lightspeed panel:
- Status Connected or Offline
- Domain Prefix
- Account ID
- Items
2. Shopify panel:
- Status Connected or Offline
- Shop
- Token Source
- Products

### 3.5 Use this page in operations
1. Start every shift by checking both connectors are Connected.
2. If backlog pressure rises unexpectedly, move to Inventory and Carts Inventory.
3. If both sources mismatch heavily, review Configurations before syncing.

## 4. Sales Page Manual

Purpose: order stream review, filtering, and pipeline processing visibility.

### 4.1 Open Sales
1. Go to /studio/shopify-mapping-inventory/sales
2. Verify Revenue Operations Console heading.

### 4.2 Refresh sales data
1. Click Refresh Now.
2. Wait until button returns to normal.
3. Confirm Last refresh timestamp updated.

### 4.3 Use filters
1. Select Store.
2. Select Pipeline state:
- All Pipeline States
- Processed Only
- Pending Only
3. Optional text filters:
- Order Number
- SKU
4. Optional date filters:
- From date
- To date
5. Click Apply Filters.
6. Use Clear to reset filters while keeping store context.

### 4.4 Read insights row
1. Gross (current page)
2. Average Order Value
3. Processed Rate
4. Pipeline State processed vs pending

### 4.5 Read order table
Columns include:
- Order
- Timeline
- Customer
- Net
- Tax
- Gross
- Logistics
- Payment
- Pipeline

### 4.6 View line item details
1. In a row, click Details in Pipeline column.
2. Review line items:
- title
- SKU
- quantity
3. Click Hide to collapse.

### 4.7 Pagination
1. Use Prev and Next.
2. Click specific page numbers.
3. Change Rows per page (20, 50, 75, 100).

## 5. Inventory Page Manual

Purpose: catalog control grid for search, sorting, selection, print, and export.

### 5.1 Open Inventory
1. Go to /studio/shopify-mapping-inventory/inventory
2. Verify Inventory Control Grid heading.

### 5.2 Search and filter
1. In search box, enter description, SKU, UPC, or system ID.
2. Set Shop / Location.
3. Set Category.
4. Set Item Type.
5. Click Search.
6. Click Clear Filters to reset.

### 5.3 Sort columns
Click any sortable table header:
- CUSTOM SKU
- UPC
- ITEM
- COLOR
- SIZE
- QTY (when shown)
- location-specific QTY columns
- PRICE
- CATEGORY

Second click toggles ascending and descending.

### 5.4 Select rows
1. Use top checkbox to select all visible rows.
2. Use row checkbox for individual selection.
3. Selected count affects Print and Export Selected actions.

### 5.5 Print workflow (RFID)
1. Select one or more rows.
2. Click Print.
3. Wait for status message completion.
4. Review Success and Failed counts.

### 5.6 Export workflow
1. Click Export.
2. Choose:
- Export Selected
- Export All Filtered
3. CSV file is downloaded locally.
4. Review status if export was truncated due to API size limits.

### 5.7 Pagination and page size
1. Choose Per Page: 100 or 500.
2. Use Go To First / Go To Last.
3. Use arrow buttons for previous and next pages.
4. Use numbered page buttons.

## 6. Carts Inventory Page Manual

Purpose: inspect cart-side inventory rows, variants, processing status, and batch actions.

### 6.1 Open Carts Inventory
1. Go to /studio/shopify-mapping-inventory/carts-inventory
2. Verify Cart (...shop...) Inventory heading.

### 6.2 Refresh data
1. Click Refresh in hero section.
2. Confirm Last refresh timestamp updates.

### 6.3 Search filters
Use these filters before running Search:
- SKU
- Group SKU
- Product Name
- Brand
- Price From
- Price To
- Stock From
- Stock To
- Product Status
- Category
- Search Keyword

Then:
1. Click Search.
2. Use Reset to clear all filters.

### 6.4 Summary stats
Review:
- Total Products
- Total Items
- Total Processed
- Total Pending

### 6.5 Row actions
1. Select variants using checkboxes.
2. Use batch buttons:
- Add Selected
- Delete Selected
- Re-sync all items
3. Set Rows per page from dropdown.

### 6.6 Parent/child expansion
1. Click row expand control in Status column.
2. Child table opens with variant details:
- SKU
- UPC
- Seller SKU
- Cart ID
- Stock by location
- Price
- Color
- Size
- Image
- Status
3. Collapse when done.

### 6.7 Pagination
1. Use Prev/Next.
2. Use numbered page buttons.
3. Verify Showing Page X of Y footer text.

## 7. POS Configurations Manual

Purpose: configure how POS data maps and how orders are created in Lightspeed.

### 7.1 Open POS Configurations
1. Go to /studio/shopify-mapping-inventory/configurations/pos
2. Verify heading POS (Lightspeed - Lightspeed_257323) Configurations.

### 7.2 Pull mapping data
1. Click Pull Mapping Data from Lightspeed POS.
2. Wait for completion message.
3. Continue to each section and save.

### 7.3 Basic Settings section
Fields:
- Sync Status
- Order Sync Status
- Complete Sync
- Sync eCom enabled
- Sync store wise inventory

Steps:
1. Set each toggle as required.
2. Click Save.
3. Confirm status message Basic Settings saved.

### 7.4 Product Related Mapping section
Fields:
- SKU
- Stock Source (multi-select)
- Price
- Cost Price
- MSRP
- ListPrice
- Price Level 1
- Price Level 2
- Price Level 3
- B2B Price
- Sale Price

Steps:
1. Choose SKU source first.
2. Select stock source locations.
3. Map each price level intentionally.
4. Click Save.

### 7.5 Download Orders Settings (Default)
Fields:
- Register
- Payment Type
- Employee
- Shop

Steps:
1. Select default register.
2. Select payment type (recommended eCom for online).
3. Select default employee.
4. Select default shop.
5. Click Save.

### 7.6 Order Configurations per shop
For each shop block:
- Register
- Employee

Steps:
1. Set register for the shop.
2. Set employee for that shop.
3. Click Save on that shop block.
4. Repeat for all shop blocks.

## 8. Cart Configurations Manual

Purpose: control cart-side publishing rules, update rules, order status intake, tax, and reserve stock.

### 8.1 Open Cart Configurations
1. Go to /studio/shopify-mapping-inventory/configurations/cart
2. Verify heading Cart (Shopify - 30e7d3.myshopify.com) Configurations.

### 8.2 Sync approval lock (critical)
Current behavior:
- Pull Mapping Data from Shopify button is disabled.
- Label shows Approval Required.
- Clicking while locked shows Sync is locked. Waiting for your app approval.

Do not bypass this lock until owner approval is provided.

### 8.3 Basic Settings
Fields:
- Sync Status
- Live Upload
- Integration Type

Steps:
1. Set Sync Status according to operation window.
2. Set Live Upload based on whether immediate publishing is desired.
3. Set Integration Type:
- Complete Product Sync
- Stock and Price Sync
- Stock and Price with New Product Sync
4. Click Save.

### 8.4 Mapping For New Products
Fields:
- Product Name
- Description
- URL and Handle
- Price
- Compare at price
- Barcode
- Vendor
- Tags (multi-select)
- Weight

Steps:
1. Map Product Name and Description first.
2. Set URL and Handle source carefully to avoid slug issues.
3. Map price and compare price.
4. Map barcode and vendor.
5. Select one or more tags sources.
6. Map weight if available.
7. Click Save.

### 8.5 Rules for new products
Fields:
- Product Status
- Inventory Management
- Post Variant As Individual Product

Steps:
1. Enable Product Status if you need invisible-by-default posting behavior.
2. Enable Inventory Management only when Shopify inventory tracking should be bypassed.
3. Enable Post Variant As Individual Product only for channels requiring split products.
4. Click Save.

### 8.6 Map Stores
Purpose: map each Shopify store entry to a POS store source.

Steps:
1. Review Shopify Store value row by row.
2. Select POS Store from dropdown for each row.
3. Confirm mapping update message appears.

### 8.7 Rules for product update
Each checkbox controls whether an existing Shopify product field is updated.

Available toggles:
- Product Name
- Description
- URL and Handle
- Price
- Compare at price
- Cost price
- Barcode
- Product Type
- Vendor
- Product Image
- Product Weight
- Product Tags
- Style Attributes

Steps:
1. Enable only fields you trust from source data quality.
2. Keep risky fields off if current Shopify content is curated manually.
3. Click Save.

### 8.8 Order status
Choose which order statuses are pulled for POS processing:
- Authorized
- Pending
- Paid
- Partially paid
- Voided

Steps:
1. Enable only statuses your POS team can operationally handle.
2. Start with Paid only if uncertain.
3. Expand to additional statuses after testing.
4. Click Save.

### 8.9 Tax Settings
Field:
- Price entered with Tax

Steps:
1. Enable only if Shopify product prices are tax-inclusive.
2. Leave disabled if prices are pre-tax.
3. Click Save.

### 8.10 Reserve Stock
Field:
- Enter Reserve Stock (non-negative whole number)

Steps:
1. Enter buffer quantity to withhold from selling availability.
2. Use 0 if no reserve is needed.
3. Click Save.

Validation notes:
- Empty value auto-saves as 0.
- Non-numeric value is rejected with validation message.

## 9. Recommended Setup Sequence (Before Sync Approval)

1. Open Workset and verify both integrations are connected.
2. Configure POS Configurations fully and save each section.
3. Configure Cart Configurations fully and save each section.
4. In Carts Inventory, verify sample rows, variants, and statuses.
5. In Sales, validate expected order visibility and filter behavior.
6. In Inventory, validate search, sort, print, and export controls.
7. Perform owner review and collect sign-off.
8. Only then request sync approval unlock.

## 10. Approval Checklist for Owner Review

Use this checklist during review:
1. Navigation and submenu structure is correct.
2. POS mappings are complete for all required fields.
3. Cart mappings are complete for all required fields.
4. Product update rules align with business policy.
5. Order status intake aligns with accounting flow.
6. Tax setting matches store tax model.
7. Reserve stock is set to approved value.
8. Store mapping is correct for every Shopify store row.
9. No sync action executes before approval.
10. Team confirms readiness to unlock pull/sync controls.

## 11. Troubleshooting

### 11.1 Data not loading
1. Refresh the page.
2. Check integration status on Workset.
3. Confirm API routes are reachable.
4. Retry with narrower filters.

### 11.2 No rows after filtering
1. Clear all filters.
2. Reapply one filter at a time.
3. Check date ranges and status filters.

### 11.3 Export or print issues
1. Ensure at least one row is selected for selected-row actions.
2. Use Export All Filtered if selected export is empty.
3. Confirm printer dependencies for RFID print.

### 11.4 Configuration appears unsaved
1. Press Save in the specific section card.
2. Wait for status confirmation message.
3. Refresh and verify values persist (if persistence backend is connected).

## 12. Notes for Current Draft

- This is a review draft manual for current implemented UI behavior.
- Some Save actions are currently local UI behavior unless backend persistence is wired.
- Cart pull/sync remains intentionally approval-locked.

End of manual.
