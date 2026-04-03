# Master plan: Windows → Ubuntu (review only)

**Status:** Documentation for your review. **Do not execute** backup, sync, uninstall, or deletes until **you** explicitly approve each phase.

**Goals (your words summarized):** Keep **all Cursor transcripts** and profile data in backups; keep **project archives separate** from Cursor zips (except where Cursor/other apps naturally mix inside profile folders); mirror **`D:\backup c`** to Ubuntu (**replace** the previous Ubuntu copy with the **current** backup when you sync); run **carbon-gen** at **localhost:3000** and **carbon-warehouse-management** (CarbonWMS) at **localhost:3040** under **`/home/eliorp1/dev/...`**; include **`D:\Projects`** in backups (the two active repos under **`My project`**, plus **`carbon-gen-backups-outside`** and any loose zips/scripts you keep); **no junctions, no mirrors** on Windows; **never delete `D:\Projects` (or other D: project trees) for migration** — they stay on D: and are only **copied** to Ubuntu (see Phase 3). **Uninstalling Cursor on Windows** or when you use which machine is **outside** this plan (you decide when you are comfortable). Personal Windows cleanup remains optional (§8).

---

## Current state — please review (aligned with disk, 2026-04)

This section is the **snapshot** you asked for; if your folders change, update this block.

### `D:\Projects\My project\` (expected contents)

| Name | Role |
|------|------|
| **`carbon-gen\`** | Git repo → `shopcarbon12-gif/carbon-gen`, **`main`**. Single canonical Next.js tree. Accessibility, Instagram-style widget, Shopify collection mapping, and similar features live **inside** this repo (e.g. `app/accessibility\`), not in sibling copies. |
| **`carbon-warehouse-management\`** | Git repo → `shopcarbon12-gif/carbon-warehouse-management`, **`main`**. CarbonWMS. |
| **`carbon-gen-backup-2026-03-02_*.zip`** (if present) | Optional local snapshots; keep until you no longer need recovery from that date. |
| **`vscode-migration-beginner-guide.ts`** (if present) | Loose file; backup or delete per your preference — not part of either repo unless you move it. |

**No longer on disk (removed by choice):** full-copy sandboxes **`carbon-gen-side-accessibility`**, **`carbon-gen-side-accessibility-2`**, and their **`.zip`** archives; plus **`shop-carbon-app`**, **`shopify-ai-backend`**, **`carbon-gen1`**, **`carbon-stu`**, **`cursor-safe-archive`**, **`gemini old studio`**, **`Gemini Studio`**, **`User`**, **`.tmp_empty_delete`**. Those were used historically so alternate UIs would not affect the main theme; going forward the plan assumes **one `carbon-gen` clone** and isolation via **routes/branches**, not duplicate project roots.

### `D:\Projects\` (outside `My project`)

| Name | Role |
|------|------|
| **`carbon-gen-backups-outside\`** | e.g. dated source trees without `.git` — still **mirror** with backups / Ubuntu prep. |

### Dev workflow (reference)

- **Prefer:** feature branches, or clearly scoped routes/components under **`carbon-gen`**, so `localhost:3000` always reflects one tree.
- **Avoid:** copying the whole repo to a sibling folder unless you have a rare, time-boxed reason — it complicates git state and backups.

---

## Where `D:\Projects` actually is

On your machine, **`D:\Projects`** currently has **two** top-level entries:

| Top-level folder | Typical role |
|------------------|--------------|
| **`D:\Projects\My project\`** | **Two** git repos + optional zips/scripts (see **Current state**). |
| **`D:\Projects\carbon-gen-backups-outside\`** | e.g. dated snapshot folder(s) without `.git` — still **copy** into `D:\backup c\...` or mirror to Ubuntu as part of “everything on D: that matters.” |

There is **no** requirement that every folder be a git repo. Non-git trees still move via **robocopy / zip / rsync** like any other project backup.

---

## Canonical paths and ports (primary apps)

| Role | Windows (source) | Ubuntu (target dev) | Localhost |
|------|------------------|---------------------|-----------|
| **carbon-gen** (Next.js) | `D:\Projects\My project\carbon-gen` | `/home/eliorp1/dev/carbon-gen` | **http://localhost:3000** |
| **CarbonWMS** | `D:\Projects\My project\carbon-warehouse-management` | `/home/eliorp1/dev/carbon-warehouse-management` | **http://localhost:3040** |
| **Full backup mirror** | `D:\backup c\` (entire tree) | `/home/eliorp1/backup-from-windows-c/` | (not a web app) |

**Loose files** under `My project` (zips, scripts) do not need a separate Ubuntu dev path unless you unpack them on purpose.

**Mirror (this plan):** means **file copy or sync** (e.g. `rsync`, `scp -r`, shared folder + copy) so Ubuntu holds a **duplicate** of the backup tree as of the last sync. It is **not** a Windows **junction**, **symlink**, or other “one path points at another” trick — those are unrelated.

---

## Inventory: git repos and extras (summary)

Use this as the **checklist** for backups, Ubuntu layout, and **Phase 0** git hygiene. **Re-run** `git status` / `git remote -v` before cutover. Details and rationale are in **Current state** above.

| Folder | Git | Remote / branch | Notes |
|--------|-----|-----------------|--------|
| **carbon-gen** | Yes | `origin` → `shopcarbon12-gif/carbon-gen`, **main** | **Deploy:** `npm run deploy:coolify` (env gate per repo docs). |
| **carbon-warehouse-management** | Yes | `origin` → `shopcarbon12-gif/carbon-warehouse-management`, **main** | Deploy per that repo (Coolify/README). |

**Also plan backups for:** **`D:\Projects\carbon-gen-backups-outside\`** (non-git snapshots); optional **`carbon-gen-backup-*.zip`** and other loose files under **`My project`** if you still keep them there.

**Historical (removed 2026-04):** duplicate **`carbon-gen`** sandboxes and other folders listed in **Current state** — not part of migration scope anymore.

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

Once **`D:\backup c`** has been mirrored to **`/home/eliorp1/backup-from-windows-c/`** (Cursor zips, project artifacts, reports), **paste the following** into **Cursor on Ubuntu**, **Claude Code**, **global agent instructions**, or any new coding agent. **This repo also ships the same rule** in **`.cursor/rules/ubuntu-transcripts-backup-canonical.mdc`** (`alwaysApply: true`) so Cursor picks it up without re-pasting.

```
=== HARD LOCK — transcripts & past session context (non-negotiable) ===

Windows backups are mirrored on this machine at:
  /home/eliorp1/backup-from-windows-c/

This tree is the CANONICAL offline reference for Cursor chat / transcript–style continuity and related profile data. Exact zip names may vary; search archives/ if filenames differ slightly.

You MUST know upfront:
  - Cursor profile + transcript-style data (zipped):  backup-from-windows-c/archives/
      Examples: AppData-Roaming-Cursor.zip, UserProfile-dot-cursor.zip
      (Conversation/workspace history often lives inside these zips or in extracted profile trees — use unzip -l, ag/ripgrep on extracted copies, or read tools as appropriate.)
  - Project zip/trees if present: backup-from-windows-c/project-repos/
      and archives under it, or any project zips under archives/projects/
  - Optional: full-folder copy of D:\Projects\My project if mirrored here as extras beyond the two repos

When the user asks about a PAST question, decision, agreement, or session ("what did we say", "last time", earlier chat):
  - Do NOT refuse with "I don't have access to previous conversations" until you have TRIED this mirror path (list dirs, inspect zips, search inside extracted or mounted read-only copies).
  - Treat this location as the first place to look for continuity — not an optional footnote.

Do NOT delete, move, or rewrite files under backup-from-windows-c/ unless the user explicitly orders it.

For day-to-day editing, prefer live clones under /home/eliorp1/dev/ (e.g. carbon-gen, carbon-warehouse-management). The mirror is for reference, recovery, and answering questions about the past — not the primary working tree.
```

Adjust the root path if your sync layout differs (e.g. different username); keep the **hard lock** behavior the same.

---

## Phase 0 — Pre-flight (before any backup)

Run for **both** repos (**carbon-gen**, **carbon-warehouse-management**) and note any **non-git** trees you still mirror (**`carbon-gen-backups-outside`**, optional zips):

| Check | Why |
|--------|-----|
| `git status` | Know WIP vs clean. |
| Unpushed commits vs `origin` | Ubuntu `git clone` sees **remote**, not unpushed local commits. |
| **Coolify / production** | When you request it: **commit**, **push**, **`npm run deploy:coolify`** (carbon-gen) or warehouse equivalent so production matches **origin**. |
| **Flutter / other apps** | If Flutter (or other) roots live outside this inventory, repeat checks there. |
| **Secrets** | `.env.local` etc. — copy securely to Ubuntu; never commit. |

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
- **Optional:** copy **`D:\Projects\carbon-gen-backups-outside`** and any **`carbon-gen-backup-*.zip`** (or all of **`My project`**) into `D:\backup c\` or straight to Ubuntu if you want them beside the scripted repo zips.

---

## Phase 2 — Ubuntu: replace old mirror, sync **entire** `D:\backup c`

1. On Ubuntu, **remove or empty** the existing **`~/backup-from-windows-c/`** tree when you are ready to replace it with a **fresh** sync (you accept dropping the **previous** Ubuntu-side mirror).
2. Copy **the whole** current **`D:\backup c`** tree from Windows to **`/home/eliorp1/backup-from-windows-c/`** (`rsync`, `scp -r`, or shared folder + `cp -a`) so Ubuntu reflects **this** backup, not an older copy. Mind the **space** in **`D:\backup c`** when quoting paths on Windows.

**Windows `D:\Projects\...` is not deleted** in this step — only the **Ubuntu destination** for the backup mirror is replaced/updated.

Again: **mirror = duplicate files by copying/syncing**, not a junction or symlink.

---

## Phase 3 — D: projects (hard lock) vs C: Cursor profile

**`D:\Projects` and other D: project directories — do not delete for migration (or any purpose called out in this plan).** They remain the **on-disk source** on Windows. Migration means **copying / mirroring** to Ubuntu (and **replacing** stale copies **on Ubuntu** — e.g. under **`~/backup-from-windows-c/`** or your **`~/dev/...`** working trees when **you** choose to refresh them), **not** removing projects from **D:**.

- This plan **never** instructs deleting, shrinking, or “cleaning up” **`D:\Projects\...`** to complete migration.
- **`/home/eliorp1/dev/...`** working copies on Ubuntu are populated by **clone**, **unpack from backup**, or **rsync** from your latest trees — refresh/replace those **Linux** paths when you want them to match current backups; **D:** stays intact.

**Cursor on C:** — optional cleanup **only** after **you** verify backups, and **only** for Cursor profile paths on **C:**: **`backup-c-to-d-and-ubuntu.ps1 -DeleteSourcesAfterCopy`** affects **C:** profile data **only**, **not** **`D:\Projects\...`**.

---

## Phase 4 — Ubuntu dev dirs and **localhost:3000** / **3040**

1. Place working copies under **`/home/eliorp1/dev/carbon-gen`** and **`/home/eliorp1/dev/carbon-warehouse-management`** (clone from git, or unpack from `backup-from-windows-c/project-repos`, plus **`.env`**). These are the **only** git app roots in scope; unpack any extra zips only if you still use them. When you want Ubuntu to match **new** Windows backups, **replace or refresh** these **Linux** directories — still **do not** delete the Windows **`D:\Projects\...`** sources for that reason alone.
2. **`npm install`**, Docker/DB per each README.
3. **Port conflict:** if both compose files bind host **5432**, change one.
4. **carbon-gen → :3000**, **carbon-warehouse-management → :3040** (bind **0.0.0.0** if you test from Windows host via port forward).
5. **Verify behavior**, not only “server listens”: pages, auth, API, assets.

---

## §8 — Personal end state (beyond this repo’s automation)

You stated that **after** Ubuntu is fully working and synced, you intend to **remove permanently** essentially **all** files related to **any** dev software on the **entire Windows PC**, keeping only what you explicitly preserve for projects. That is **your** operational decision; this document does not run those deletes. **Important:** ensure **git remotes**, **Coolify**, and **off-host backups** satisfy you **before** aggressive Windows wiping.

---

## After Ubuntu is canonical: are `D:\` / `C:\` paths irrelevant?

**For daily development on Ubuntu: mostly yes** — you work in **`/home/eliorp1/dev/...`**.

**Windows paths often still matter:** git remote URLs, Coolify/production env, docs or scripts with hardcoded `D:\`, webhooks/tunnels aimed at old Windows localhost, and **any time you or an agent still runs commands on Windows**.

### Hard lock for agents (Windows + occasional Windows use)

**All agents** (Cursor and others) must **minimize unnecessary writes to `C:\`**. Use **`C:\` only when required** (OS, or a tool with no practical alternative). Put generated files, temp work, large outputs, and “clean up later” artifacts on **`D:\`**, the **workspace**, or project **`tmp/`** (gitignored) — **plenty of room there**; **do not** treat **`C:\`** as a scratch disk.

This repo encodes that as an always-on Cursor rule: **`.cursor/rules/windows-minimize-c-drive-writes.mdc`**. Copy that file into other repos (e.g. **carbon-warehouse-management**) if you want the same behavior there.

---

## Tooling reference (this repo)

| Goal | Script / doc |
|------|--------------|
| Cursor profile → `D:\backup c` + profile zips | `scripts/backup-c-to-d-and-ubuntu.ps1` |
| carbon-gen + carbon-warehouse-management → `D:\backup c\project-repos\` | `scripts/backup-projects-to-d.ps1` (optional: extend paths for zips / `carbon-gen-backups-outside`) |
| Claude Code prompts | `docs/claude-code-backup-c-drive-prompts.md` |
| This plan (HTML twin) | `docs/migration-ubuntu-master-plan.html` |
| Agents: avoid unnecessary `C:\` writes on Windows | `.cursor/rules/windows-minimize-c-drive-writes.mdc` |

---

## Risks and rollback

| Risk | Mitigation |
|------|------------|
| Unpushed work lost | Push before treating remote as truth; project backup keeps `.git` by default. |
| Deleted local-only repos | Already removed from disk; if you recreate any, add **`git remote`** or rely on backups. |
| Huge sync | Exclude heavy dirs or use `rsync`; plan disk/time. |
| Missing `.env` on Ubuntu | Checklist + secure copy. |
| Postgres port clash | Change one compose host port. |
| Accidental secret in zip | Review untracked files (e.g. `dropbox-*.json`, `.env`) before archiving. |
| `C:\` filled by agent/temp junk | Follow **`.cursor/rules/windows-minimize-c-drive-writes.mdc`**; outputs on **D:** or workspace **`tmp/`**. |

---

## Confirmation checklist (you sign when true)

- [ ] Phase 0 done for **carbon-gen** + **carbon-warehouse-management** + any **non-git** backup trees you still use (`carbon-gen-backups-outside`, optional zips).
- [ ] Phase 1A + 1B completed; `D:\backup c` layout understood (`archives` vs `project-repos`; optional extra copies of `My project` / `carbon-gen-backups-outside`).
- [ ] Phase 2 full tree at `~/backup-from-windows-c/` (Ubuntu side replaced with **current** sync from Windows).
- [ ] Phase 3: **`D:\Projects\...` never deleted** for migration; Ubuntu mirrors / `~/dev/...` refreshed only when **you** choose.
- [ ] Phase 4: **3000** = carbon-gen, **3040** = carbon-warehouse-management, behavior verified.
- [ ] (Optional personal) Windows PC cleaned per §8 only when you are ready.

---

*Markdown source: `docs/migration-ubuntu-master-plan.md` — open `docs/migration-ubuntu-master-plan.html` in a browser for the same content in readable HTML.*
