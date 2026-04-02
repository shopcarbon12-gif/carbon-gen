# C:\ Drive Migration Report

**Date:** March 13, 2026  
**Updated:** April 2, 2026 — scope clarified for agents (see “For AI assistants”)

**Readable HTML checklist (same content, execution table):** [`docs/c-drive-migration-report.html`](docs/c-drive-migration-report.html) — open in a browser (`file:///…/docs/c-drive-migration-report.html`).

**Scope of this file (strict):** Windows **only** — moving **Cursor / Codex / `.cursor`** usage off **`C:\`** onto **`D:\`**, shortcuts, and `CODEX_HOME`.  
**Not in scope:** VirtualBox, Ubuntu, Docker Engine, git clone into a VM, or Coolify. For **all of that**, the canonical document is:

- **`docs/virtualbox-linux-cursor-flutter-android-guide.html`** (open in browser; read **`#agent-directive`** first)

There is also a copy-paste agent contract: **`docs/AGENT_HANDOFF_VIRTUALBOX_LINUX.md`**.

---

## For AI assistants

- If the user’s question is **VM + Ubuntu + Carbon repos + Docker in Linux + production Coolify**, **do not** answer from this markdown alone. Open the **HTML guide** above and follow its phases and prohibitions (especially: no Docker Desktop → VM disk copy; production is Coolify; dev Postgres is `docker compose` in the VM).
- If the question is **only** finishing **Cursor on D:** / **cleanup-cursor-from-c.ps1** / **CODEX_HOME**, use **this file** and the script paths below.
- **Never** merge the two documents into one improvised plan.

---

## Completed

| Task | Status |
|------|--------|
| Copy Cursor to D:\CursorData | Done (~27.5 GB) |
| Copy Codex to D:\.codex | Done (~236 MB) |
| Copy .cursor to D:\CursorData\.cursor-backup | Done |
| Set CODEX_HOME = D:\.codex | Done (user env var) |
| Create Cursor shortcut | Done (Desktop: "Cursor (D-Drive)") |
| Delete C:\Users\Elior\.codex | Done |

---

## Pending (Cursor must be closed)

**~13.5 GB** still on C:\ because Cursor is running and has files locked:

- `C:\Users\Elior\AppData\Roaming\Cursor`
- `C:\Users\Elior\.cursor`

### To finish cleanup

1. **Close Cursor completely**

2. **Run the cleanup script:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File "d:\Projects\My project\carbon-gen\scripts\cleanup-cursor-from-c.ps1"
   ```

3. **Launch Cursor from the new shortcut:**  
   Desktop → **"Cursor (D-Drive)"**

4. **Do not use the old Cursor shortcut** – it will use C:\ again

---

## Final state

| Location | C:\ | D:\ |
|----------|-----|-----|
| Cursor data | ~13.5 GB (pending delete) | D:\CursorData ✓ |
| Codex | Deleted ✓ | D:\.codex ✓ |
| .cursor backup | Pending delete | D:\CursorData\.cursor-backup ✓ |

---

## After cleanup

- **CODEX_HOME** = `D:\.codex` (set in user environment)
- **Cursor** = `D:\cursor\Cursor.exe` with `--default-data-dir "D:\CursorData"`
- **Shortcut** = Desktop shortcut "Cursor (D-Drive)"

---

## VirtualBox + Ubuntu + Cursor + Flutter (canonical guide)

**The full VM migration report and step-by-step plan are only in the HTML guide:**

- **`docs/virtualbox-linux-cursor-flutter-android-guide.html`**
- Section **`#agent-directive`** — document hierarchy + hard prohibitions for assistants
- **`docs/AGENT_HANDOFF_VIRTUALBOX_LINUX.md`** — master prompt to paste into a new agent chat

Open the HTML in a browser (path depends on your clone; example):  
`file:///…/carbon-gen/docs/virtualbox-linux-cursor-flutter-android-guide.html`

It includes Phases A–H, **§10.8b Docker Desktop vs Ubuntu Engine**, **§13.0 Coolify (production)**, **§15 move checklist**, and stack tables for carbon-gen / CarbonWMS.

**This markdown file** stays limited to **Windows Cursor / Codex / `.cursor` relocation to D:**. When daily development moves to **Linux Cursor in the VM**, treat this file as **host-side legacy** and follow the HTML guide §15 for editor migration.
