# Agent handoff: VirtualBox + Ubuntu + Carbon projects (strict)

**Give the assistant this entire file as context**, or paste the **“Master prompt”** block below into a new chat. Do not paraphrase the prohibitions.

---

## Document hierarchy (non-negotiable)

| If the user asks about… | Open and follow… |
|-------------------------|------------------|
| Ubuntu VM, VirtualBox, Guest Additions, toolchain (Node 20, Flutter, Android), **Docker Engine in Linux**, git clone into VM, move vs mirror, §15 checklist, **Coolify vs local Docker** | `docs/virtualbox-linux-cursor-flutter-android-guide.html` — especially `#agent-directive`, `#start-here`, `#docker-desktop-to-ubuntu`, `#coolify-prod`, `#migration-move-policy` |
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

---

## Master prompt (copy everything inside the fence)

```
You are helping migrate Carbon development to Ubuntu inside VirtualBox on Windows.

AUTHORITATIVE DOCS (do not substitute):
1) VM + toolchain + Docker Engine + move policy + Coolify context:
   carbon-gen repo → docs/virtualbox-linux-cursor-flutter-android-guide.html
   Read #agent-directive, #canonical-plan, #start-here (Phases A–H), #docker-desktop-to-ubuntu, #coolify-prod, #migration-move-policy.
2) Windows-only: Cursor/Codex/.cursor off C:\ onto D:\:
   carbon-gen repo root → C_DRIVE_MIGRATION_REPORT.md
   Use this ONLY for that Windows cleanup — NOT for the Ubuntu VM plan.

STRICT PROHIBITIONS:
- Do NOT plan to "transfer" or copy Docker Desktop's data into Ubuntu. Install Docker Engine in Ubuntu; docker compose re-pulls images. Use pg_dump/pg_restore only if local Postgres data must move.
- Do NOT claim you can automate BIOS, Ubuntu installer GUI, or VM password entry.
- Do NOT advise long-term development on VirtualBox shared folders (/media/sf_*); copy into ~/dev then work there.
- Do NOT confuse Coolify production (VPS) with VM docker compose (local dev).
- Do NOT run carbon-gen and CarbonWMS compose both on host port 5432 without changing one file.
- Do NOT install Ubuntu-host VirtualBox .deb inside the guest for Guest Additions; use Insert Guest Additions CD from the Windows host.

WHEN ADVISING: Quote or paraphrase the relevant section of the HTML guide; if the question is only Windows Cursor on D:, use C_DRIVE_MIGRATION_REPORT.md only.

User repos: carbon-gen, carbon-warehouse-management (CarbonWMS). Production for both: Coolify. Local Postgres: Docker Engine in VM per each repo's compose file.
```

---

## After Linux is the daily driver

`C_DRIVE_MIGRATION_REPORT.md` becomes **legacy Windows host** cleanup. Prefer **Cursor for Linux** inside the VM (`~/.config`, etc.); see HTML guide §15 Cursor checklist.
