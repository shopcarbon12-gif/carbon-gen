# Master plan: Windows → Ubuntu (review only)

**Status:** Documentation for your review. **Do not execute** backup, sync, uninstall, or deletes until **you** explicitly approve each phase.

**Goals (your words summarized):** Keep **all Cursor transcripts** and profile data in backups; keep **project archives separate** from Cursor zips (except where Cursor/other apps naturally mix inside profile folders); mirror **`D:\backup c`** to Ubuntu; run **carbon-gen** at **localhost:3000** and **carbon-warehouse-management** (CarbonWMS) at **localhost:3040** under **`/home/eliorp1/dev/...`**; **no junctions, no mirrors** on Windows; **one Cursor** on Ubuntu only; eventually **clean the Windows PC** of dev tooling once Ubuntu is 100% trusted (personal scope, see §8).

---

## Canonical paths and ports

| Role | Windows (source) | Ubuntu (target dev) | Localhost |
|------|------------------|---------------------|-----------|
| **carbon-gen** (Next.js) | `D:\Projects\My project\carbon-gen` | `/home/eliorp1/dev/carbon-gen` | **http://localhost:3000** |
| **CarbonWMS** | `D:\Projects\My project\carbon-warehouse-management` | `/home/eliorp1/dev/carbon-warehouse-management` | **http://localhost:3040** |
| **Full backup mirror** | `D:\backup c\` (entire tree) | `/home/eliorp1/backup-from-windows-c/` | (not a web app) |

---

## Cursor backups = transcripts + profile (not a substitute for git)

- **`%APPDATA%\Cursor`** (Roaming) and **`%USERPROFILE%\.cursor`** hold **settings, extensions, workspace storage, AI/chat history–style data**, and other metadata.
- **Goal:** Preserve **everything** you need so transcripts and workspace context are not lost. Each fresh run of the Cursor backup script **refreshes** the copies and zips from the **current** profile (you are not “losing” old transcripts in the zip unless the live profile on disk no longer contains them).
- **Project source code** still lives in **git** and in **`D:\Projects\My project\...`**; you still run **project** backups separately.

**Project zips vs Cursor zips:** **Always separate archives** for the two repos (`carbon-gen`, `carbon-warehouse-management`). **Cursor** zips stay the **two** profile archives (or whatever names the script emits). If **Cursor** or other tools write files **inside** the profile trees, those files ride along inside the **Cursor** backup — that is normal; you are not asked to split those by hand.

---

## After Ubuntu has backups: prompt for AI agents

Once **`D:\backup c`** has been mirrored to **`/home/eliorp1/backup-from-windows-c/`** (Cursor zips, project artifacts, reports), **paste the following** into **Cursor on Ubuntu**, **Claude Code**, or any coding agent so they use the same reference tree:

```
Windows backups are mirrored on this machine at:
  /home/eliorp1/backup-from-windows-c/

Use it as the canonical offline reference for:
  - Cursor profile / transcript archives: backup-from-windows-c/archives/ (e.g. AppData-Roaming-Cursor.zip, UserProfile-dot-cursor.zip)
  - Project zip/trees if present: backup-from-windows-c/project-repos/ (and archives under it) or any project zips under archives/projects/

Do not delete or rewrite files there unless I explicitly ask. For day-to-day work, prefer /home/eliorp1/dev/carbon-gen and /home/eliorp1/dev/carbon-warehouse-management after restore/clone.
```

Adjust subpaths if your sync layout differs.

---

## Phase 0 — Pre-flight (before any backup)

Run in **`carbon-gen`** and **`carbon-warehouse-management`**:

| Check | Why |
|--------|-----|
| `git status` | Know WIP vs clean. |
| Unpushed commits vs `origin` | Ubuntu `git clone` sees **remote**, not unpushed local commits. |
| **Coolify / production** | When you request it, **commit**, **push**, and **`npm run deploy:coolify`** (or warehouse equivalent) so **web/apps** match **origin** and production is current. |
| **Flutter / other apps** | If Flutter (or other) roots live elsewhere, repeat checks there. |
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

---

## Phase 2 — Ubuntu: replace old mirror, sync **entire** `D:\backup c`

1. On Ubuntu, move or delete **`~/backup-from-windows-c`** contents only when you accept losing the previous mirror.
2. Copy **the whole** **`D:\backup c`** tree to **`/home/eliorp1/backup-from-windows-c/`** (`rsync`, `scp -r`, or shared folder + `cp -a`). Mind the **space** in **`D:\backup c`** when quoting paths on Windows.

---

## Phase 3 — C: vs D:

- **Projects** you develop live on **D:** — no requirement to delete them for migration.
- **Cursor on C:** — optional cleanup **after** verified backups: **`backup-c-to-d-and-ubuntu.ps1 -DeleteSourcesAfterCopy`** removes **only** Cursor profile paths on **C:**, not **`D:\Projects\...`**.

---

## Phase 4 — Ubuntu dev dirs and **localhost:3000** / **3040**

1. Place working copies under **`/home/eliorp1/dev/carbon-gen`** and **`/home/eliorp1/dev/carbon-warehouse-management`** (clone from git, or unpack from `backup-from-windows-c/project-repos`, plus **`.env`**).
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
|------|----------------|
| Cursor profile → `D:\backup c` + profile zips | `scripts/backup-c-to-d-and-ubuntu.ps1` |
| carbon-gen + carbon-warehouse-management → `D:\backup c\project-repos\` | `scripts/backup-projects-to-d.ps1` |
| Claude Code prompts | `docs/claude-code-backup-c-drive-prompts.md` |
| This plan (HTML twin) | `docs/migration-ubuntu-master-plan.html` |

---

## Risks and rollback

| Risk | Mitigation |
|------|------------|
| Unpushed work lost | Push before treating remote as truth; project backup keeps `.git` by default. |
| Huge sync | Exclude heavy dirs or use `rsync`; plan disk/time. |
| Missing `.env` on Ubuntu | Checklist + secure copy. |
| Postgres port clash | Change one compose host port. |

---

## Confirmation checklist (you sign when true)

- [ ] Phase 0 done for both repos (+ Flutter path if applicable).
- [ ] Phase 1A + 1B completed; `D:\backup c` layout understood (`archives` vs `project-repos`).
- [ ] Phase 2 full tree at `~/backup-from-windows-c/`.
- [ ] Phase 4: **3000** = carbon-gen, **3040** = carbon-warehouse-management, behavior verified.
- [ ] Phase 5: Windows Cursor retired; single Cursor on Ubuntu.
- [ ] (Optional personal) Windows PC cleaned per §8 only when you are ready.

---

*Markdown source: `docs/migration-ubuntu-master-plan.md` — open `docs/migration-ubuntu-master-plan.html` in a browser for the same content in readable HTML.*
