# Agent handoff: VirtualBox + Ubuntu + Carbon projects (strict)

**Give the assistant this entire file as context**, or paste the **“Master prompt”** block below into a new chat. Do not paraphrase the prohibitions.

---

## Document hierarchy (non-negotiable)

| If the user asks about… | Open and follow… |
|-------------------------|------------------|
| Ubuntu VM, VirtualBox, Guest Additions, toolchain (Node 20, Flutter, Android), **Docker Engine in Linux**, git clone into VM, move vs mirror, §15 checklist, **archive-to-D-before-delete**, **Coolify vs local Docker** | `docs/virtualbox-linux-cursor-flutter-android-guide.html` — especially `#agent-directive`, `#archive-policy`, `#start-here`, `#docker-desktop-to-ubuntu`, `#coolify-prod`, `#migration-move-policy` |
| Moving **Windows Cursor / Codex / `.cursor`** off **C:\\** to **D:\\**, shortcuts, `CODEX_HOME`, `cleanup-cursor-from-c.ps1` | `C_DRIVE_MIGRATION_REPORT.md` (repo **root**) |

**Never** treat `C_DRIVE_MIGRATION_REPORT.md` as the VM migration plan. **Never** invent steps that are not in the HTML guide for VM work.

---

## Hard rules (violations cause user harm)

1. **Docker:** Do **not** instruct copying Docker Desktop’s disk, WSL2 Docker storage, or image layers into Ubuntu. Install **Docker Engine** in Ubuntu; use `docker compose` to **re-pull** images. Preserve DB data only via **`pg_dump` / restore** if needed.
2. **Human-only:** No tool can press BIOS keys, drive Ubuntu’s install wizard clicks, or type VM passwords.
3. **Workspace:** Canonical repos live under **`~/dev/...`** inside the VM — not permanent editing on **`/media/sf_*`** shared folders.
4. **Production:** **Coolify** (VPS) runs production Next + linked Postgres. VM `docker compose` is **local dev only**.
5. **Port 5432:** carbon-gen and CarbonWMS default compose both map **5432** — do not run both at once without changing one host port.
6. **Guest Additions:** From host menu **Insert Guest Additions CD**; do **not** install `virtualbox-*_Ubuntu_*_amd64.deb` from downloads **inside the guest** for GA (wrong package purpose).
7. **Windows originals:** Do **not** advise **deleting** Windows project folders until the user has **zip-archived** them to **D:** (e.g. `D:\archive-pre-linux-verify\`, dated zip names) **and** fully verified the Linux VM workflow. Default = **archive, not delete**.

---

## If `git pull` on the VM refuses (common after copying from a share)

- **`docs/virtualbox-linux-cursor-flutter-android-guide.html` untracked:** Git will not overwrite it with the tracked version. **Rename or move** it aside (e.g. `/tmp/virtualbox-guide.pre-pull.bak`), then `git pull`.
- **`C_DRIVE_MIGRATION_REPORT.md` modified locally:** Discard VM-only edits with `git checkout -- C_DRIVE_MIGRATION_REPORT.md` if you want the repo copy, **or** `git stash push -m vm` first, then pull, then inspect stash.
- **Clean tree = match GitHub exactly:** only after backups: `git fetch origin && git reset --hard origin/main` (discards **all** local commits and uncommitted changes in that clone — do not run casually).

---

## Master prompt (copy everything inside the fence — single message)

```
You are helping migrate Carbon development to Ubuntu inside VirtualBox on Windows.

AUTHORITATIVE DOCS (do not substitute):
1) VM + toolchain + Docker Engine + move policy + Coolify + archive policy:
   carbon-gen repo → docs/virtualbox-linux-cursor-flutter-android-guide.html
   Read #agent-directive, #archive-policy, #canonical-plan, #start-here (Phases A–H), #docker-desktop-to-ubuntu, #coolify-prod, #migration-move-policy.
2) Windows-only: Cursor/Codex/.cursor off C:\ onto D:\:
   carbon-gen repo root → C_DRIVE_MIGRATION_REPORT.md
   Use this ONLY for that Windows cleanup — NOT for the Ubuntu VM plan.

STAY CURRENT ON THE VM: In ~/dev/carbon-gen (or the user’s clone path), run `git pull` on main so the HTML guide and this handoff include #archive-policy and the latest text. If `git pull` refuses:
- Untracked docs/virtualbox-linux-cursor-flutter-android-guide.html (e.g. copied from a share): move/rename it aside (e.g. /tmp/virtualbox-guide.pre-pull.bak), then pull.
- Modified C_DRIVE_MIGRATION_REPORT.md on the VM: `git checkout -- C_DRIVE_MIGRATION_REPORT.md` to take repo version, or stash first.
- Only with full backups and explicit intent: `git fetch origin && git reset --hard origin/main` (wipes all local VM changes).

STRICT PROHIBITIONS:
- Do NOT plan to "transfer" or copy Docker Desktop's data into Ubuntu. Install Docker Engine in Ubuntu; docker compose re-pulls images. Use pg_dump/pg_restore only if local Postgres data must move.
- Do NOT claim you can automate BIOS, Ubuntu installer GUI, or VM password entry.
- Do NOT advise long-term development on VirtualBox shared folders (/media/sf_*); copy into ~/dev then work there.
- Do NOT confuse Coolify production (VPS) with VM docker compose (local dev).
- Do NOT run carbon-gen and CarbonWMS compose both on host port 5432 without changing one file.
- Do NOT install Ubuntu-host VirtualBox .deb inside the guest for Guest Additions; use Insert Guest Additions CD from the Windows host.
- LOCKED USER POLICY — archive, not delete: Do NOT advise deleting Windows project trees (carbon-gen, CarbonWMS, etc.) until (1) full zip archives exist on D: (e.g. D:\archive-pre-linux-verify\ with dated zips of entire trees), (2) the user has fully verified Linux VM dev matches expectations. Default = keep Windows copies and zips until explicit sign-off.

WHEN ADVISING: Quote or paraphrase the HTML guide for VM/Linux/Coolify; use C_DRIVE_MIGRATION_REPORT.md only for Windows Cursor-on-D: cleanup.

User repos: carbon-gen, carbon-warehouse-management (CarbonWMS). Production: Coolify. Local Postgres: Docker Engine in VM per each repo's compose file.
```

---

## After Linux is the daily driver

`C_DRIVE_MIGRATION_REPORT.md` becomes **legacy Windows host** cleanup. Prefer **Cursor for Linux** inside the VM (`~/.config`, etc.); see HTML guide §15 Cursor checklist.
