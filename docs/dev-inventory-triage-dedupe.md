# Dev inventory — triage, dedupe, and actions

After running `scripts/dev-disk-inventory.ps1` and completing **L4** (WinDirStat/WizTree), use this workflow to **organize** rows, **map to projects**, and decide **commit / backup / delete**.

## Inputs

| File | Purpose |
|------|---------|
| `D:\backup c\inventory\dev-inventory-<ts>.csv` | Master rows (L1–L3 + zip rows + profile) |
| `D:\backup c\inventory\git-triage-<ts>.csv` | Per-repo: remote, branch, dirty, **`UntrackedBucket`** (`0` / `few` / `many`), unpushed hints; **`SuggestedAction`** empty for you to fill |
| `D:\backup c\inventory\extra-scan-roots.txt` | Your custom paths (one per line) |
| L4 exports in same folder | Full C: / D: “what’s huge” evidence |

Open the CSVs in Excel / LibreOffice or keep them in gitignored copies under `inventory\`.

## Spreadsheet columns (merge / extend manually)

Add or fill these columns next to the exported data:

| Column | You fill |
|--------|----------|
| `SuggestedProject` | `carbon-gen`, `carbon-wms`, `general`, `unknown` — refine heuristics |
| `DuplicateOf` | Path of canonical copy if this row is a duplicate backup |
| `Action` | e.g. `KEEP_CANONICAL`, `ARCHIVE_THEN_DELETE`, `PUSH_FIRST`, `COMMIT_THEN_PUSH`, `INSPECT`, `CACHE_OK_DELETE_AFTER_BACKUP` |
| `Reviewed` | `Y` when a human decided |

## Dedupe rules

1. **Same `Remote` URL** in `git-triage` + similar folder names → likely **same repo** twice; keep **one** live tree (usually `D:\Projects\My project\...`) and mark others `DuplicateOf` that path.
2. **Same date zip** + same project name → keep **newest** or **smallest that is complete** after verifying contents once.
3. **Caches** (`npm-cache`, `.gradle`, `node_modules` in a disposable clone) → `CACHE_OK_DELETE_AFTER_BACKUP` only after git is clean/pushed or redundant.

## Commit decision matrix

| Situation | Typical `Action` |
|-----------|------------------|
| Git **clean** and **pushed** | `KEEP` or `ARCHIVE_THEN_DELETE` if duplicate |
| Git **dirty** or **unpushed** | `COMMIT_THEN_PUSH` or `PUSH_FIRST` before any delete |
| **Not git** (zip / copy) | No commit — `INSPECT` or `ARCHIVE_THEN_DELETE` when redundant |
| **Cursor profile on C:** | Backup with `backup-c-to-d-and-ubuntu.ps1` first; never delete before Ubuntu verify |

## Consolidating backups under `D:\backup c\`

Use a consistent naming pattern when you **move** (not copy-delete) duplicates into the backup tree, for example:

- `project-repos\archives\carbon-gen-<date>-from-<short-path>.zip`
- Keep **Cursor** zips separate under `archives\` per existing backup script behavior.

Do **not** delete `D:\Projects\My project\...` canonical repos for migration; only remove **extras** after backups and your explicit approval.

## Agents 1 and 2

When `SuggestedProject` is ambiguous, ask:

- **CarbonGen agent** to confirm remotes / paths for Next.js trees.
- **Carbon Warehouse agent** to confirm Flutter/WMS trees.

The **General Windows** agent owns the CSV scripts and `D:\backup c\inventory\` layout.
