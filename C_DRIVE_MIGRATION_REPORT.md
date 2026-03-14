# C:\ Drive Migration Report

**Date:** March 13, 2026

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
