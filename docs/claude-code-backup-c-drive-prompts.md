# Claude Code — C:\ backup → D:\ → Ubuntu (no junctions, no delete until you verify)

## Policy (read first)

- **No junctions, no mirrors, no `cleanup-cursor-from-c.ps1`.** You are moving material to **Ubuntu** for the new environment; do not redirect Windows profile paths.
- **Do not delete anything on C:\** (or uninstall Cursor) until the human has **verified** on Ubuntu that copies/archives are complete and projects work. **Do not run `-DeleteSourcesAfterCopy`** unless the human explicitly orders it **after** that verification.
- For preflight checks, use **`powershell -Command` / `-File`**, not raw Bash, so `Get-Item` / `Get-PSDrive` work on Windows.

Use prompts **in order**, one message at a time. **Fully quit Cursor** (no `Cursor.exe` in Task Manager) **before** the real backup (**Prompt 4** onward).

Replace **`YOUR_VM_IP`** with the Ubuntu **bridged** IP, or use **`127.0.0.1`** if the host forwards **port `2222` → guest `22`**. Change **`eliorp1`** if your Linux username differs.

If Claude Code starts in `C:\Windows\System32`, `cd` to `d:\Projects\My project\carbon-gen` before running the script.

---

## Prompt 1 — Preconditions

```
I am on Windows. Cursor is fully closed (no Cursor.exe in Task Manager). Using PowerShell (not Bash), confirm: (1) `where.exe ssh` and `where.exe scp`; (2) `Test-Path "$env:SystemRoot\System32\tar.exe"`; (3) D: drive available (`Get-PSDrive D`). Do not run the backup yet.
```

---

## Prompt 2 — Repo + script

```
cd to d:\Projects\My project\carbon-gen. Show that scripts\backup-c-to-d-and-ubuntu.ps1 exists (Get-Item). Optionally git pull on main and short status. Do not run the backup yet.
```

---

## Prompt 3 — Dry run

```
From d:\Projects\My project\carbon-gen, run exactly:
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-c-to-d-and-ubuntu.ps1" -WhatIf
Paste the full output. Do not use -DeleteSourcesAfterCopy.
```

---

## Prompt 4 — Backup to D: + zips only (no SSH)

```
Cursor is still fully closed. From d:\Projects\My project\carbon-gen, run:
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-c-to-d-and-ubuntu.ps1" -StopCursorProcesses -SkipScp
Paste the full output. When done, list the newest D:\backup c\BACKUP_REPORT_*.txt and print its full path.
```

---

## Prompt 5 — Upload zips to Ubuntu (bridged VM, port 22)

```
Cursor remains closed. From d:\Projects\My project\carbon-gen, run (replace YOUR_VM_IP if needed):
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-c-to-d-and-ubuntu.ps1" -StopCursorProcesses -SshHost "YOUR_VM_IP" -SshUser "eliorp1" -SshPort 22
If scp fails with auth, stop and explain; do not delete anything on C:\. Paste full output.
```

---

## Prompt 5b — NAT: host 2222 → guest 22

```
Cursor remains closed. From d:\Projects\My project\carbon-gen, run:
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-c-to-d-and-ubuntu.ps1" -StopCursorProcesses -SshHost "127.0.0.1" -SshUser "eliorp1" -SshPort 2222
Paste full output. If BatchMode/keys fail, explain interactive scp/ssh or fixing keys; do not delete anything on C:\.
```

*(Use **either** Prompt 5 **or** 5b.)*

---

## Prompt 6 — Read the report (end of automated Windows-side flow)

```
Open the newest D:\backup c\BACKUP_REPORT_*.txt. Paste the lines for C: free BEFORE, C: free AFTER, total backed / GB, scp results, and any errors. Summarize in 3 bullets. Do not suggest junctions, mirrors, or deleting C:\ sources unless I explicitly ask after I have verified Ubuntu.
```

---

## After Prompt 6 (human only)

1. On Ubuntu: confirm zips under `~/backup-from-windows-c/archives/`, unzip if needed, open projects in Cursor, run builds/tests until you trust the copy.
2. Only then tell Claude (or do yourself) any **delete** or **Windows uninstall** steps. That is **not** Prompt 7/8 here; you will give separate instructions when ready.

---

## Project repos (carbon-gen + CarbonWMS) → `D:\backup c\project-repos\`

Your **apps live on D:** (`D:\Projects\My project\carbon-gen`, `...\carbon-warehouse-management`). The Cursor-only script above does **not** copy them. Use **`scripts\backup-projects-to-d.ps1`** for that.

- **Default:** robocopy **skips** `node_modules`, `.next`, `dist`, `build`, etc. (smaller zips; run `npm install` on Ubuntu). Pass **`-FullTree`** if you truly want everything including `node_modules`.
- **Output:** `D:\backup c\project-repos\carbon-gen\`, `...\carbon-warehouse-management\`, zips under `...\archives\`, report `PROJECTS_BACKUP_REPORT_*.txt`.
- **Optional scp:** zips go to Ubuntu `~/backup-from-windows-c/archives/projects/` (not the same folder as the two Cursor profile zips).
- **Safety:** this script **never deletes** your D: project folders.

### Prompt P1 — Projects dry run

```
From d:\Projects\My project\carbon-gen, run:
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-projects-to-d.ps1" -WhatIf
Paste full output.
```

### Prompt P2 — Projects backup to D: (no SSH)

```
Cursor closed (or at least not locking those repos). From d:\Projects\My project\carbon-gen:
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-projects-to-d.ps1" -SkipScp
Paste full output and path of PROJECTS_BACKUP_REPORT_*.txt.
```

### Prompt P3 — Projects backup + scp (NAT 2222 example)

```
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-projects-to-d.ps1" -SshHost "127.0.0.1" -SshPort 2222 -SshUser "eliorp1"
```

*(Override paths if needed: `-CarbonGenPath "..."` `-CarbonWmsPath "..."`.)*

---

## Remove **only** Cursor profile data from C: (after fresh backup + your verification)

**`-DeleteSourcesAfterCopy` on `backup-c-to-d-and-ubuntu.ps1` removes only:** `%APPDATA%\Cursor`, `%USERPROFILE%\.cursor`, `%LOCALAPPDATA%\Cursor` (if present). It does **not** remove **`D:\Projects\...`**.

Run **only** when Cursor is fully closed and you accept losing the live profile on C: (you still have D: + Ubuntu zips).

```
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-c-to-d-and-ubuntu.ps1" -StopCursorProcesses -SkipScp -DeleteSourcesAfterCopy
```

Then optionally re-upload Cursor zips with SSH if you use `-SshHost` / `-SshUser` / `-SshPort` instead of `-SkipScp`.

---

## Related files

| File | Role |
|------|------|
| `scripts/backup-c-to-d-and-ubuntu.ps1` | Cursor profile → `D:\backup c\…`, zips, optional `scp` |
| `scripts/backup-projects-to-d.ps1` | carbon-gen + carbon-warehouse-management → `D:\backup c\project-repos\…` |
| `docs/c-drive-migration-report.html` | Human checklist + script section |
| `C_DRIVE_MIGRATION_REPORT.md` | Markdown twin + links |

*(Removed from this runbook: junction script — not part of Elior’s plan.)*
