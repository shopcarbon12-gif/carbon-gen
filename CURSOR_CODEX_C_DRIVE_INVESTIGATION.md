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
1. Close Cursor completely
2. Run: `powershell -ExecutionPolicy Bypass -File "d:\Projects\My project\carbon-gen\scripts\cleanup-cursor-from-c.ps1"`
3. Launch Cursor from Desktop shortcut **"Cursor (D-Drive)"**

---

## Final state

| Location | C:\ | D:\ |
|----------|-----|-----|
| Cursor data | ~13.5 GB (pending delete) | D:\CursorData |
| Codex | Deleted | D:\.codex |
| .cursor backup | Pending delete | D:\CursorData\.cursor-backup |

---

# Original Investigation Summary

| Location | Size | Contents |
|----------|------|----------|
| `C:\Users\Elior\AppData\Roaming\Cursor` | **~28.6 GB** | Main Cursor app data (Electron/VS Code base) |
| `C:\Users\Elior\.cursor` | varies | Cursor projects, worktrees, extensions, skills |
| `C:\Users\Elior\.codex` | **~234 MB** | Codex skills, sessions, memories, logs, state DB |

**Total on C:\: ~29+ GB**

---

## 1. Cursor - AppData Roaming

**Path:** `C:\Users\Elior\AppData\Roaming\Cursor`  
**Size:** ~28,606 MB (~28.6 GB)

| Subfolder | Size (MB) | Purpose |
|-----------|-----------|---------|
| Partitions | 395.96 | Workspace/partition data |
| snapshots | 299.60 | Editor snapshots/backups |
| CachedData | 78.58 | Cached app data |
| Cache | 13.92 | General cache |
| WebStorage | 12.19 | Web storage |
| logs | 7.65 | Log files |
| GPUCache | 1.57 | GPU cache |
| blob_storage | 4.33 | Blob storage |
| CachedExtensions | 2.25 | Extension cache |
| Other | <1 | Various small files |

**Why on C:\:** Cursor uses default Electron user data path `%APPDATA%\Cursor`. No custom data dir is set.

---

## 2. Cursor - User Profile (.cursor)

**Path:** `C:\Users\Elior\.cursor`

**Contents:** projects/, worktrees/, extensions/, skills-cursor/, ai-tracking/, browser-logs/, plans/, plugins/, snapshots/, argv.json, ide_state.json, mcp.json

**Why on C:\:** Cursor CLI defaults to `~/.cursor` (user home).

---

## 3. Codex

**Path:** `C:\Users\Elior\.codex`  
**Size:** ~234 MB

| Item | Size | Purpose |
|------|------|---------|
| state_5.sqlite | ~113 MB | Main state DB |
| logs_1.sqlite | ~44 MB | Log DB |
| models_cache.json | ~204 KB | Model cache |
| skills/ | varies | Codex skills |
| sessions/, memories/ | varies | Session/memory data |

**Why on C:\:** `CODEX_HOME` env var is NOT set, so Codex defaults to `~/.codex`.

---

## Root Cause

1. **Cursor:** No `--default-data-dir` flag; uses default `%APPDATA%\Cursor` and `~/.cursor`
2. **Codex:** `CODEX_HOME` not set; uses `C:\Users\Elior\.codex`

---

## How to Move to D:\ (Before Clean)

### Cursor
1. Close Cursor completely
2. Create shortcut to Cursor.exe, add to Target: `--default-data-dir "D:\CursorData"`
3. Copy `C:\Users\Elior\AppData\Roaming\Cursor` to `D:\CursorData`
4. Launch from shortcut

### Codex
1. Set user env var: `CODEX_HOME = D:\.codex`
2. Copy `C:\Users\Elior\.codex` to `D:\.codex`
3. Restart Codex

---

## Safe Cleanup (After Migration Only)

**Only after confirming both apps work from D:\:**
- Delete `C:\Users\Elior\AppData\Roaming\Cursor` (~28.6 GB)
- Delete `C:\Users\Elior\.cursor` (if migrated)
- Delete `C:\Users\Elior\.codex` (~234 MB)

**Do NOT delete before migration** - you will lose settings, extensions, projects, skills.

---

## Quick Reference - Paths on C:\

```
C:\Users\Elior\AppData\Roaming\Cursor\     (~28.6 GB)
C:\Users\Elior\.cursor\                     (projects, worktrees, extensions, skills)
C:\Users\Elior\.codex\                      (~234 MB)
```
