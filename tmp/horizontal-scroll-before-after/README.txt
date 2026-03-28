Shop Carbon — horizontal scroll fix: before / after screenshots
================================================================

Captured: mobile viewport ~390×844 (CSS width 375px on device scale).

BEFORE (01-before-fix.png)
  documentElement.scrollWidth = 408px
  clientWidth = 375px
  → ~33px horizontal overflow (sideways scroll / scrollbar)

AFTER (02-after-fix.png)
  Same page, same moment, with the carbon-overflow-x-fix CSS injected in the
  browser only (simulates adding {% render 'carbon-overflow-x-fix' %} to theme).
  scrollWidth = 375px (matches viewport)

Files:
  01-before-fix.png
  02-after-fix.png

To apply for real: add shopify/snippets/carbon-overflow-x-fix.liquid to your
theme and {% render 'carbon-overflow-x-fix' %} in layout/theme.liquid <head>.
