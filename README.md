# Command Reference — ChatApp Project

## Daily startup ritual (every session, every new terminal)
```powershell
cd path\to\ChatappProject\chatapp     # the OUTER folder (has requirements.txt)
.venv\Scripts\activate                # check for (.venv) in the prompt
git branch                            # check which branch you're on (* marks it)
```

## Running the app
```powershell
flask --app chatapp run --debug       # start the server (needs its own terminal)
flask --app chatapp init-db           # wipe + rebuild the database from schema.sql
```
Visit: http://127.0.0.1:5000/login

## User management (no register route — do it manually)
```powershell
python seed_user.py <email> <password> <0-or-1-for-admin>
python reset_password.py <email> <new_password>
```

## Git — daily workflow
```powershell
git branch                            # see current branch (* = active)
git branch -a                         # see ALL branches, local + remote
git status                            # what's changed / staged / untracked

git checkout -b part-X-name           # create + switch to a new branch
git add .
git commit -m "feat: description"
git push                              # normal push (after first push on this branch)
git push -u origin part-X-name        # FIRST push of a new branch only

# --- after merging the PR on GitHub ---
git checkout main
git pull
git branch                            # confirm * is on main before branching again
```

## Git — deleting branches
```powershell
git branch -d branch-name             # delete LOCAL branch (only if merged)
git branch -D branch-name             # force delete local (even if unmerged — careful)
git push origin --delete branch-name  # delete branch from GitHub
```

## Git — undo / recovery
```powershell
git restore --staged file             # unstage a file (doesn't lose changes)
git restore file                      # discard local uncommitted changes to a file
git reflog                            # see recent history, find a commit hash to go back to
git reset --hard <commit-hash>        # move branch back to that commit (loses later local commits)
git rm --cached file                  # stop tracking a file (keeps it on disk, un-ignores work)
```

## Testing API routes with curl (PowerShell)
```powershell
# ALWAYS use curl.exe, not curl (PowerShell's "curl" is a different, incompatible command)
# ALWAYS put JSON bodies in a FILE, not inline — avoids all quoting hell

# create a JSON body file
'{"email":"you@ccintl.com","password":"yourpassword"}' | Out-File -Encoding utf8 login.json

# log in and SAVE the session cookie
curl.exe -c cookies.txt -X POST http://127.0.0.1:5000/api/login -H "Content-Type: application/json" -d "@login.json"

# use the saved cookie on later requests (-b = "send this cookie back")
curl.exe -b cookies.txt http://127.0.0.1:5000/api/chats/
curl.exe -b cookies.txt -X POST http://127.0.0.1:5000/api/chats/
curl.exe -b cookies.txt -X DELETE http://127.0.0.1:5000/api/chats/1
```

## New-machine setup (cloning onto a different PC)
```powershell
git clone https://github.com/MMykka/Chatapp.git
cd Chatapp\chatapp
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
flask --app chatapp init-db
python seed_user.py you@ccintl.com yourpassword 1
```
Also: install Ollama, then `ollama pull llama3.2` and `ollama pull nomic-embed-text`.
Remember: `.venv/`, `instance/`, `login.json`, `cookies.txt` never travel with the repo — they're gitignored and get recreated per machine.

## Quick database checks (no separate file needed)
```powershell
python -c "import sqlite3; print(sqlite3.connect('instance/chatapp.sqlite').execute('SELECT * FROM user').fetchall())"
```

## Known gotchas (so future-you isn't confused again)
- **PowerShell ≠ CMD**: `rmdir /s /q` is CMD syntax → use `Remove-Item -Recurse -Force` in PowerShell.
- **PowerShell's `curl` is fake**: always type `curl.exe` to get the real one.
- **`.gitignore` only blocks NEW untracked files** — if something's already committed, `.gitignore` won't stop it; use `git rm --cached` first.
- **New terminal = cold start**: venv is NOT active until you activate it again, every single time.
- **New branch's first push needs `-u origin branch-name`** — after that, plain `git push` works.
- **`>` overwrites a file, `>>` appends** — use `>>` when adding lines to an existing `.gitignore`.
