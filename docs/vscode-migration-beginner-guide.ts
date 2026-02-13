export const vscodeMigrationBeginnerGuide = `
# VS Code Move to D: Drive - Beginner Step-by-Step Guide

## Goal
Move/reinstall VS Code while keeping all your code, backups, secrets, and project setup safe.

## Quick Safety Summary
- Your main project is in: D:\\Projects\\My project\\carbon-gen
- Your code is pushed to GitHub (\`origin/main\`)
- You have restore bundles in: D:\\Projects\\My project\\carbon-gen\\backups
- Most important local file to back up manually: .env.local

## Part 1 - What You Must Keep Before Uninstalling VS Code
- Project folder: D:\\Projects\\My project\\carbon-gen
- Restore backups folder: D:\\Projects\\My project\\carbon-gen\\backups
- Secrets file: D:\\Projects\\My project\\carbon-gen\\.env.local
- Optional VS Code settings:
  - C:\\Users\\<YourUser>\\AppData\\Roaming\\Code\\User\\settings.json
  - C:\\Users\\<YourUser>\\AppData\\Roaming\\Code\\User\\keybindings.json
  - C:\\Users\\<YourUser>\\AppData\\Roaming\\Code\\User\\snippets\\
- Optional extension list:
  - Run: code --list-extensions > vscode-extensions.txt

## Part 2 - Beginner Backup Steps (Do This First)
1. Create a backup folder, for example: D:\\Backup-Before-VSCode-Reinstall
2. Copy your full project folder (carbon-gen) into that backup folder.
3. Copy .env.local separately into that backup folder.
4. Copy the backups folder into that backup folder.
5. Optional: copy VS Code User settings/keybindings/snippets.
6. Optional: export extension list to a text file.
7. Confirm your backups by opening a few files from backup location.

## Part 3 - Uninstall VS Code (Safe Way)
1. Close VS Code completely.
2. Uninstall Visual Studio Code from Windows Apps/Programs.
3. If prompted about removing user data, keep it unless you want a full reset.
4. Restart your computer.

## Part 4 - Reinstall on D: Drive
1. Download latest VS Code installer from official website.
2. Use custom install path on D:, for example: D:\\Apps\\VSCode
3. Finish installation and launch VS Code.
4. Install Git and Node.js if missing.

## Part 5 - Restore Project Workflow
1. Open folder: D:\\Projects\\My project\\carbon-gen
2. Open terminal in that folder.
3. Run: npm install
4. Run local app:
   - npm run start:local
   - or npm run dev
5. Open browser: http://localhost:3000
6. If needed, restore .env.local from backup copy.

## Part 6 - If Something Goes Wrong
- Re-clone repo from GitHub origin.
- Restore from bundle in backups folder.
- Restore .env.local from backup.
- Run npm install again.
- Restart local stack and test localhost:3000.

## Your Current Important Paths
- Project: D:\\Projects\\My project\\carbon-gen
- Restore bundles: D:\\Projects\\My project\\carbon-gen\\backups
- Guide file: docs/vscode-migration-beginner-guide.ts

## One-Minute Checklist
- [ ] Project copied to backup
- [ ] .env.local copied to backup
- [ ] backups folder copied
- [ ] VS Code reinstalled on D:
- [ ] npm install completed
- [ ] localhost:3000 opens successfully
`;

export default vscodeMigrationBeginnerGuide;
