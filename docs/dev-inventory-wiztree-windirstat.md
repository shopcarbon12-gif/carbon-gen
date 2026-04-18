# L4 — WinDirStat / WizTree (mandatory full-drive maps)

PowerShell inventory (`scripts/dev-disk-inventory.ps1`) covers **L1–L3** and **L5** (git). **L4** is a **manual** full visualization of **everything large** on **C:** and **D:** so odd paths (renamed folders, games next to dev trees) are not missed.

## Where to save exports

Put screenshots or exported reports under:

`D:\backup c\inventory\`

Suggested filenames:

- `windirstat-C-drive.png` (or `.csv` if the tool exports a list)
- `windirstat-D-drive.png`
- or `wiztree-C-drive.csv` / `wiztree-D-drive.csv`

These files should be included when you mirror **`D:\backup c`** to Ubuntu (`~/backup-from-windows-c/`) so the Ubuntu agent can confirm they exist.

## WinDirStat

1. Download **WinDirStat** (official site) if not installed.
2. Run **as Administrator** if you want fewer “access denied” gaps (optional).
3. **Select** drive **C:** → OK → wait for scan to finish.
4. Use **File → Save report** or take a **screenshot** of the treemap + top directory list.
5. Repeat for drive **D:**.

## WizTree

1. Install **WizTree** from antibody-software.com (or Microsoft Store build).
2. Open WizTree → select **C:** → **Scan** → **File → Export CSV** (or screenshot the top folders view).
3. Repeat for **D:**.
4. Save exports into `D:\backup c\inventory\`.

## Why both drives

- **C:** catches profile spillover, `Program Files` dev tools, and anything not under the L1 list.
- **D:** catches backup folders with non-obvious names that heuristics might not classify.

After L4, cross-check large folders against `dev-inventory-*.csv` from the script; add any missing roots to `extra-scan-roots.txt` and re-run the script if needed.
