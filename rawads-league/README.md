# Rawad's League

Rawad's League is a simple friendship scoreboard. Visitors are spectators. The admin can add friends, add or deduct points, edit entries, delete entries, and update the league title.

This version uses no Supabase, no backend, no npm, and no build tools.

## How it works

- `index.html`, `styles.css`, and `app.js` make the website.
- `db.json` is the starting JSON database.
- When the page opens, it loads `db.json`.
- After edits, the browser saves the changed database in `localStorage`.
- Admins can export the current database as `db.json`.
- Admins can import a JSON file to replace the browser's local database.

Important: GitHub Pages is static hosting. It cannot save changes back into `db.json` for everyone automatically. If Rawad edits the league on his browser, those edits live in that browser until he exports the JSON and uploads/commits the new `db.json`.

## Default admin password

The default admin password is:

```text
rawad-admin
```

Change it from the website:

1. Open the site.
2. Click **Admin login**.
3. Enter the default password.
4. Click **Settings**.
5. Enter a new admin password.
6. Save settings.
7. Export JSON.
8. Replace the repository's `db.json` with the exported file.

The password itself is not stored in plain text. `db.json` stores a SHA-256 hash. This is simple, not serious security. Anyone who can edit JavaScript in their own browser can bypass a static site's UI. Use this only for a private/fun project.

## Files

```text
rawads-league/
├── index.html
├── styles.css
├── app.js
├── db.json
├── README.md
├── manifest.json
├── service-worker.js
└── assets/
    └── logo.svg
```

## Local testing

Do not open `index.html` directly. Use a tiny local web server so `db.json` and the service worker behave correctly.

From inside the `rawads-league` folder:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

If port `8000` is busy:

```bash
python -m http.server 8080
```

## GitHub Pages deployment

1. Create a GitHub repository.
2. Upload every file inside `rawads-league`.
3. Open the repository on GitHub.
4. Go to **Settings**.
5. Go to **Pages**.
6. Choose **Deploy from a branch**.
7. Select the `main` branch.
8. Select the root folder.
9. Save.
10. Open the GitHub Pages URL when GitHub finishes publishing.

Optional Git commands:

```bash
git init
git add .
git commit -m "Create Rawad's League"
git branch -M main
git remote add origin REPOSITORY_URL
git push -u origin main
```

## Updating the shared database

Because this is static hosting, edits do not automatically update GitHub.

To make Rawad's edits visible to everyone:

1. Login as admin.
2. Make changes.
3. Click **Export JSON**.
4. Replace the repository's `db.json` with the exported file.
5. Commit and push.
6. GitHub Pages redeploys.

Visitors who already opened the site may need a hard refresh if the service worker cached old files.

## Changing the service worker cache

When static files change, update this line in `service-worker.js`:

```javascript
const CACHE_VERSION = "rawads-league-simple-v1";
```

For example, change it to:

```javascript
const CACHE_VERSION = "rawads-league-simple-v2";
```

Then commit and push.

## Security note

This is intentionally simple.

- There is no real server-side security.
- The role system is local to the browser.
- Spectators do not see edit buttons.
- Admin mode requires the password hash in `db.json`.
- A technical person can still bypass frontend-only controls.

For real private admin security, use a backend or a hosted database with server-side rules. This project avoids that because it is meant to stay simple.

## Troubleshooting

### Blank page

Use a local server instead of opening the file directly. Check that `app.js`, `styles.css`, and `db.json` are in the same folder.

### Login does not work

Try the default password `rawad-admin`. If you changed it and forgot it, replace `db.json` with a backup or put the default hash back into `settings.adminPasswordHash`.

### My edits disappeared

Edits are saved in the current browser's `localStorage`. If you clear site data or use another browser, you need to import/export JSON.

### Other people cannot see my edits

Export JSON after editing, replace `db.json` in GitHub, commit, and push.

### GitHub Pages shows old code

Update `CACHE_VERSION` in `service-worker.js`, commit, push, then hard-refresh the browser.

### Avatar image does not show

Use a full `https://` image URL. Some websites block external image loading, so the app falls back to emoji or initials.
