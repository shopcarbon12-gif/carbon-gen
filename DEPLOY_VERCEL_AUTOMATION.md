# Vercel Auto-Deploy Setup (Windows)

This project is already linked to Vercel (`carbon-gen`).  
Goal: every `git push` to `main` triggers automatic production deploy on Vercel.

## 1) One-Time Setup

1. Open a new terminal (important after Git install).
2. Go to project folder:
```powershell
cd C:\Users\Elior\Desktop\carbon-gen
```
3. Verify Git:
```powershell
git --version
```
If you still get `git is not recognized`, run this once in PowerShell, then close/reopen terminal:
```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path","User") + ";C:\Program Files\Git\cmd;C:\Program Files\Git\bin",
  "User"
)
```
Temporary fix for current window only:
```powershell
$env:Path += ";C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
git --version
```
4. If this is your first Git use on this computer, set identity:
```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 2) Create GitHub Repo + Push Code

1. Create a new empty GitHub repository (no README, no .gitignore) named `carbon-gen`.
2. In terminal, run:
```powershell
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/carbon-gen.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

If remote already exists, update it:
```powershell
git remote set-url origin https://github.com/<YOUR_GITHUB_USERNAME>/carbon-gen.git
```

## 3) Connect GitHub Repo in Vercel

1. Open Vercel dashboard.
2. Open project `carbon-gen`.
3. Go to `Settings -> Git`.
4. Connect repository `carbon-gen`.
5. Confirm `Production Branch = main`.
6. Keep auto-deploy enabled (default).

## 4) Daily Workflow (After Setup)

Each time you change code locally:
```powershell
git add .
git commit -m "Describe your change"
git push
```

That push automatically triggers Vercel deployment.  
You do **not** need to run `vercel --prod` manually anymore.

## 5) If You Want One-Command Manual Deploy (Optional)

Without Git push, you can still deploy directly:
```powershell
npx vercel --prod
```

Use this only when needed; Git auto-deploy is the recommended flow.
