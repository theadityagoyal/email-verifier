# Git Hygiene — Quick Reference

Common commands for keeping secrets and junk files out of the repo.

## Ignore a file/folder

```powershell
echo "filename" >> .gitignore
```

## Already tracked? Remove from Git (keeps local file)

```powershell
git rm --cached filename
git rm --cached -r foldername/
```

## `.env` specifically

```powershell
echo ".env" >> .gitignore
git rm --cached backend\.env
git add .gitignore
git commit -m "chore: stop tracking .env"
git push origin master
```

## Check if a file is ignored

```powershell
git check-ignore -v filename
```

## Verify nothing sensitive is tracked

```powershell
git status
git check-ignore -v backend\.env
git check-ignore -v frontend\node_modules\
```

---

**Never commit:** `.env`, `node_modules/`, `dist/`/`build/`, IDE configs (`.vscode/`, `.idea/`), OS files (`.DS_Store`, `Thumbs.db`)

**Always commit:** `.env.example`, `package-lock.json`, source code, config files

If a secret was already pushed to a remote repo, `git rm --cached` is not enough — it's still in history. Use `git filter-repo` or BFG Repo-Cleaner to rewrite history, then rotate the leaked secret regardless.
