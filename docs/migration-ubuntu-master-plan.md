# Master plan: Windows → Ubuntu (review only)

**Status:** Documentation for your review. **Do not execute** backup, sync, uninstall, or deletes until **you** explicitly approve each phase.

**Goals (your words summarized):** Keep **all Cursor transcripts** and profile data in backups; keep **project archives separate** from Cursor zips (except where Cursor/other apps naturally mix inside profile folders); mirror **`D:\backup c`** to Ubuntu; run **carbon-gen** at **localhost:3000** and **carbon-warehouse-management** (CarbonWMS) at **localhost:3040** under **`/home/eliorp1/dev/...`**; bring **every tree under `D:\Projects`** along in backups and Ubuntu planning (git or not); **no junctions, no mirrors** on Windows; **one Cursor** on Ubuntu only; eventually **clean the Windows PC** of dev tooling once Ubuntu is 100% trusted (personal scope, see §8).

---

## Where `D:\Projects` actually is

On your machine, **`D:\Projects`** currently has **two** top-level entries:

| Top-level folder | Typical role |
|------------------|--------------|
| **`D:\Projects\My project\`** | Active repos only (see inventory); duplicate full-copy sandboxes were removed after you consolidated work into **carbon-gen**. |
| **`D:\Projects\carbon-gen-backups-outside\`** | e.g. dated snapshot folder(s) without `.git` — still **copy** into `D:\backup c\...` or mirror to Ubuntu as part of “everything on D: that matters.” |

There is **no** requirement that every folder be a git repo. Non-git trees still move via **robocopy / zip / rsync** like any other project backup.

---

## Canonical paths and ports (primary apps)

| Role | Windows (source) | Ubuntu (target dev) | Localhost |
|------|------------------|---------------------|-----------|
| **carbon-gen** (Next.js) | `D:\Projects\My project\carbon-gen` | `/home/eliorp1/dev/carbon-gen` | **http://localhost:3000** |
| **CarbonWMS** | `D:\Projects\My project\carbon-warehouse-management` | `/home/eliorp1/dev/carbon-warehouse-management` | **http://localhost:3040** |
| **Full backup mirror** | `D:\backup c\` (entire tree) | `/home/eliorp1/backup-from-windows-c/` | (not a web app) |

**Other repos / folders** under `D:\Projects\My project\` (see inventory) can use **`/home/eliorp1/dev/<folder-name>`** (or a subfolder you prefer) once you decide which you run on Ubuntu day to day.

**Mirror (this plan):** means **file copy or sync** (e.g. `rsync`, `scp -r`, shared folder + copy) so Ubuntu holds a **duplicate** of the backup tree as of the last sync. It is **not** a Windows **junction**, **symlink**, or other “one path points at another” trick — those are unrelated.

---

## Inventory: everything under `D:\Projects\My project\`

Use this as the **checklist** for backups, Ubuntu layout, and **Phase 0** git hygiene. Rows reflect an **automated scan** of the disk layout and `git` metadata; **re-run** `git status` / `git remote -v` before you cut over.

| Folder | Git | Remote / branch (when present) | Notes |
|--------|-----|--------------------------------|--------|
| **carbon-gen** | Yes | `origin` → `shopcarbon12-gif/carbon-gen`, **main** | Primary Next.js app; **deploy:** `npm run deploy:coolify` (with env gate per repo docs). Accessibility / widget / collection-mapping work lives here (e.g. `app/accessibility`); no separate sibling clone required. |
| **carbon-warehouse-management** | Yes | `origin` → `shopcarbon12-gif/carbon-warehouse-management`, **main** | CarbonWMS; deploy per that repo (Coolify/README). |

**Removed from disk (your choice, 2026-04):** full-copy sandboxes used so alternate UIs would not affect the main theme — **`carbon-gen-side-accessibility`**, **`carbon-gen-side-accessibility-2`**, plus **`shop-carbon-app`**, **`shopify-ai-backend`**, **`carbon-gen1`**, **`carbon-stu`**, **`cursor-safe-archive`**, **`gemini old studio`**, **`Gemini Studio`**, **`User`**, **`.tmp_empty_delete`**, and the **`carbon-gen-side-accessibility*.zip`** archives. If anything was never pushed to GitHub, it existed only in those trees (now gone).

You may still have **other** files under `My project` (e.g. dated **`carbon-gen-backup-*.zip`**, loose scripts); include or exclude from backups as you prefer.

**`D:\Projects\carbon-gen-backups-outside\`:** e.g. **`carbon-gen-src-20260213-125031`** — **no `.git`** in scan; **copy** with other backups.

---

## Cursor: global settings vs project-specific (organize intentionally)

**Global (all workspaces)** — lives in **`%APPDATA%\Cursor\User\settings.json`** (Roaming). On your machine this is currently minimal (e.g. `editor.fontSize`). **Put here:** font size, theme, generic editor behavior, things you want **every** repo to share.

**Per-project** — committed or local files **inside each repo**:

| Location | Purpose |
|----------|---------|
| **`<repo>/.vscode/settings.json`** | Workspace settings: terminal default shell, `files.exclude` / `search.exclude` (e.g. `.next`), ESLint working directories, extension IDs that are workspace-scoped. **Repos that currently have it:** `carbon-gen`, `carbon-warehouse-management`. |
| **`<repo>/.cursor/rules/*.mdc`** | Cursor **project rules** (agents). **carbon-gen** and **carbon-warehouse-management** hold the active rule sets. |

**Principle:** If it is **only** for one stack (Next.js paths, Flutter, Coolify hints), keep it in **that repo’s** `.vscode` / `.cursor`. If it is **personal preference everywhere**, keep it in **global** `settings.json`. After Ubuntu install, **re-copy** or **sync** global Cursor settings once, then open each repo so workspace settings apply.

---

## Cursor backups = transcripts + profile (not a substitute for git)

- **`%APPDATA%\Cursor`** (Roaming) and **`%USERPROFILE%\.cursor`** hold **settings, extensions, workspace storage, AI/chat history–style data**, and other metadata.
- **Goal:** Preserve **everything** you need so transcripts and workspace context are not lost. Each fresh run of the Cursor backup script **refreshes** the copies and zips from the **current** profile (you are not “losing” old transcripts in the zip unless the live profile on disk no longer contains them).
- **Project source code** still lives in **git** and in **`D:\Projects\...`**; run **project** backups for **`My project`** (now mostly the two repos plus any loose zips/scripts you keep).

**Project zips vs Cursor zips:** **Always separate archives** for **Cursor profile** vs **project trees**. **`scripts/backup-projects-to-d.ps1`** defaults to **carbon-gen** + **carbon-warehouse-management**; add paths if you store extra artifacts under `My project`. **Cursor** zips stay the **profile** archives (or whatever names the script emits). If **Cursor** or other tools write files **inside** the profile trees, those files ride along inside the **Cursor** backup — that is normal; you are not asked to split those by hand.

---

## After Ubuntu has backups: prompt for AI agents

Once **`D:\backup c`** has been mirrored to **`/home/eliorp1/backup-from-windows-c/`** (Cursor zips, project artifacts, reports), **paste the following** into **Cursor on Ubuntu**, **Claude Code**, or any coding agent so they use the same reference tree:

```
Windows backups are mirrored on this machine at:
  /home/eliorp1/backup-from-windows-c/

Use it as the canonical offline reference for:
  - Cursor profile / transcript archives: backup-from-windows-c/archives/ (e.g. AppData-Roaming-Cursor.zip, UserProfile-dot-cursor.zip)
  - Project zip/trees if present: backup-from-windows-c/project-repos/ (and archives under it) or any project zips under archives/projects/
  - Any full-folder copies of D:\Projects\My project (if you mirrored them under backup-from-windows-c or elsewhere)

Do not delete or rewrite files there unless I explicitly ask. For day-to-day work, prefer /home/eliorp1/dev/... for repos you actively develop (e.g. carbon-gen, carbon-warehouse-management) after restore/clone.
```

Adjust subpaths if your sync layout differs.

---

## Phase 0 — Pre-flight (before any backup)

Run **for every git repo** you care about, and **list** non-git folders for manual copy:

| Check | Why |
|--------|-----|
| `git status` | Know WIP vs clean. |
| Unpushed commits vs `origin` | Ubuntu `git clone` sees **remote**, not unpushed local commits. **No remote** = nothing to push until you **`git remote add`**. |
| **Coolify / production** | When you request it, **commit**, **push**, and **`npm run deploy:coolify`** (carbon-gen) or the **warehouse** equivalent so **web/apps** match **origin** and production is current. **Side branches** and **local-only repos** may have **no** deploy step. |
| **Flutter / other apps** | If Flutter (or other) roots live elsewhere, repeat checks there. |
| **Secrets** | `.env.local` etc. — copy securely to Ubuntu; never commit. **Scan** untracked files for tokens before zipping or uploading. |

---

## Phase 1 — Fresh backups on Windows (`D:\backup c`)

### 1A — Cursor profile (transcripts + profile)

- Script: **`scripts/backup-c-to-d-and-ubuntu.ps1`**
- **Quit Cursor** (or `-StopCursorProcesses` from external PowerShell).
- Refreshes folders under `D:\backup c\` and **zips** in **`D:\backup c\archives\`** (typically **`AppData-Roaming-Cursor.zip`**, **`UserProfile-dot-cursor.zip`**).

### 1B — Projects (separate from Cursor zips)

- Script: **`scripts/backup-projects-to-d.ps1`**
- Defaults: **`D:\Projects\My project\carbon-gen`**, **`D:\Projects\My project\carbon-warehouse-management`**
- Default output root **`D:\backup c\project-repos\`** (override with **`-BackupRoot`** if you want another folder under `D:\backup c`).
- By default **excludes** `node_modules`, `.next`, etc. (use **`-FullTree`** if you insist on everything).
- **To include all other `D:\Projects\...` trees:** add paths to this script over time, or run a **separate** full-folder copy of **`D:\Projects\My project`** and **`D:\Projects\carbon-gen-backups-outside`** into `D:\backup c\` (or straight to Ubuntu).

---

## Phase 2 — Ubuntu: replace old mirror, sync **entire** `D:\backup c`

1. On Ubuntu, move or delete **`~/backup-from-windows-c`** contents only when you accept losing the previous mirror.
2. Copy **the whole** **`D:\backup c`** tree to **`/home/eliorp1/backup-from-windows-c/`** (`rsync`, `scp -r`, or shared folder + `cp -a`). Mind the **space** in **`D:\backup c`** when quoting paths on Windows.

Again: **mirror = duplicate files by copying/syncing**, not a junction or symlink.

---

## Phase 3 — C: vs D:

- **Projects** you develop live on **D:** — no requirement to delete them for migration.
- **Cursor on C:** — optional cleanup **after** verified backups: **`backup-c-to-d-and-ubuntu.ps1 -DeleteSourcesAfterCopy`** removes **only** Cursor profile paths on **C:**, not **`D:\Projects\...`**.

---

## Phase 4 — Ubuntu dev dirs and **localhost:3000** / **3040**

1. Place working copies under **`/home/eliorp1/dev/carbon-gen`** and **`/home/eliorp1/dev/carbon-warehouse-management`** (clone from git, or unpack from `backup-from-windows-c/project-repos`, plus **`.env`**). **Other** folders from the inventory: **`/home/eliorp1/dev/<name>`** as you need them.
2. **`npm install`**, Docker/DB per each README.
3. **Port conflict:** if both compose files bind host **5432**, change one.
4. **carbon-gen → :3000**, **carbon-warehouse-management → :3040** (bind **0.0.0.0** if you test from Windows host via port forward).
5. **Verify behavior**, not only “server listens”: pages, auth, API, assets.

---

## Phase 5 — One Cursor on Ubuntu; retire Windows Cursor

1. Repeat Phase 4 until stable (including reboot).
2. **Uninstall Cursor on Windows**; work only in **Cursor on Ubuntu**.
3. **No junctions, no mirrors** on Windows per your policy.

---

## §8 — Personal end state (beyond this repo’s automation)

You stated that **after** Ubuntu is fully working and synced, you intend to **remove permanently** essentially **all** files related to **any** dev software on the **entire Windows PC**, keeping only what you explicitly preserve for projects. That is **your** operational decision; this document does not run those deletes. **Important:** ensure **git remotes**, **Coolify**, and **off-host backups** satisfy you **before** aggressive Windows wiping.

---

## After Ubuntu is canonical: are `D:\` / `C:\` paths irrelevant?

**For daily development: yes.** You work in **`/home/eliorp1/dev/...`** on Ubuntu.

**Still touch once or occasionally:** git remote URLs, Coolify/production env, docs or scripts with hardcoded `D:\`, webhooks/tunnels aimed at old Windows localhost.

---

## Tooling reference (this repo)

| Goal | Script / doc |
|------|--------------|
| Cursor profile → `D:\backup c` + profile zips | `scripts/backup-c-to-d-and-ubuntu.ps1` |
| carbon-gen + carbon-warehouse-management → `D:\backup c\project-repos\` | `scripts/backup-projects-to-d.ps1` (extend for more paths if you want every folder under `My project`) |
| Claude Code prompts | `docs/claude-code-backup-c-drive-prompts.md` |
| This plan (HTML twin) | `docs/migration-ubuntu-master-plan.html` |

---

## Risks and rollback

| Risk | Mitigation |
|------|------------|
| Unpushed work lost | Push before treating remote as truth; project backup keeps `.git` by default. |
| Local-only repos | (Historical) No `origin` — backup **folder** was the safety net. |
| Huge sync | Exclude heavy dirs or use `rsync`; plan disk/time. |
| Missing `.env` on Ubuntu | Checklist + secure copy. |
| Postgres port clash | Change one compose host port. |
| Accidental secret in zip | Review untracked files (e.g. `dropbox-*.json`, `.env`) before archiving. |

---

## Confirmation checklist (you sign when true)

- [ ] Phase 0 done for **all** git repos you rely on + inventory of non-git folders.
- [ ] Phase 1A + 1B completed; `D:\backup c` layout understood (`archives` vs `project-repos` vs any **full `Projects`** copy).
- [ ] Phase 2 full tree at `~/backup-from-windows-c/`.
- [ ] Phase 4: **3000** = carbon-gen, **3040** = carbon-warehouse-management, behavior verified; other dev dirs as needed.
- [ ] Phase 5: Windows Cursor retired; single Cursor on Ubuntu.
- [ ] (Optional personal) Windows PC cleaned per §8 only when you are ready.

---

*Markdown source: `docs/migration-ubuntu-master-plan.md` — open `docs/migration-ubuntu-master-plan.html` in a browser for the same content in readable HTML.*
