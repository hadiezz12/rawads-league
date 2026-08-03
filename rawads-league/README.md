# Rawad's League

Rawad's League is a public friendship leaderboard with one admin: Rawad.

Visitors can open the site and watch the leaderboard. Rawad can log in and add friends, edit friends, delete friends, add points, deduct points, edit activities, and delete activities.

The site is still just HTML, CSS, and JavaScript on GitHub Pages. Supabase stores the shared data so laptop and phone see the same leaderboard.

## Files you care about

```text
rawads-league/
├── index.html
├── styles.css
├── app.js
├── config.js
├── supabase-setup.sql
├── README.md
├── manifest.json
├── service-worker.js
└── assets/
    └── logo.svg
```

## Super simple overview

GitHub Pages shows the website.

Supabase stores:

- league name
- friends
- points history

Supabase Auth logs Rawad in.

Supabase Row Level Security makes sure visitors can only read. Only Rawad's Auth user can write.

## Step 1: Create the Supabase project

1. Open https://supabase.com
2. Click **Start your project** or **Sign in**.
3. Sign in.
4. Click **New project**.
5. Choose your organization.
6. In **Project name**, type:

```text
rawads-league
```

7. Type a database password. Save it somewhere safe.
8. Choose the nearest region.
9. Click **Create new project**.
10. Wait until Supabase finishes creating it.

## Step 2: Create the database tables

1. In Supabase, open your `rawads-league` project.
2. Look at the left sidebar.
3. Click **SQL Editor**.
4. Click **New query**.
5. Open this file in the GitHub repo:

```text
rawads-league/supabase-setup.sql
```

6. Copy only **SECTION 1** and **SECTION 2**.
7. Paste them into Supabase SQL Editor.
8. Click **Run**.

Stop here. Do not run SECTION 3 yet.

## Step 3: Create Rawad's admin login

1. In Supabase left sidebar, click **Authentication**.
2. Click **Users**.
3. Click **Add user**.
4. Click **Create new user** if Supabase shows choices.
5. Type Rawad's email.
6. Type Rawad's password.
7. If you see **Auto Confirm User**, turn it on.
8. Click **Create user**.

There is no sign-up page on the website. Only this user should exist.

## Step 4: Copy Rawad's user UUID

1. Stay on **Authentication** -> **Users**.
2. Click Rawad's user row.
3. Find the long ID/UUID. It looks like this:

```text
00000000-0000-0000-0000-000000000000
```

4. Copy that UUID.

## Step 5: Give only Rawad admin write permission

1. Go back to **SQL Editor**.
2. Click **New query**.
3. Copy **SECTION 3** from `supabase-setup.sql`.
4. Find this text:

```text
YOUR_RAWAD_USER_UUID
```

5. Replace it with the UUID you copied.
6. Click **Run**.

Now visitors can read, but only Rawad can write.

## Step 6: Get your Supabase URL and anon key

1. In Supabase left sidebar, click the **Project Settings** gear icon.
2. Click **API**.
3. Find **Project URL**.
4. Copy it.
5. Find **Project API keys**.
6. Copy the **anon** or **publishable** key.

Do not copy the service role key. Never put the service role key in GitHub.

## Step 7: Put the Supabase values into the website

Open:

```text
rawads-league/config.js
```

It looks like this:

```javascript
window.RAWADS_LEAGUE_CONFIG = {
  supabaseUrl: "YOUR_SUPABASE_PROJECT_URL",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  rawadUserId: "YOUR_RAWAD_USER_UUID"
};
```

Replace:

- `YOUR_SUPABASE_PROJECT_URL` with the Project URL
- `YOUR_SUPABASE_ANON_KEY` with the anon/publishable key
- `YOUR_RAWAD_USER_UUID` with Rawad's UUID

Commit and push `config.js` to GitHub.

## Step 8: Disable public sign-ups

Supabase dashboard wording can change, but usually:

1. Click **Authentication**.
2. Click **Providers** or **Sign In / Providers**.
3. Click **Email**.
4. Keep email/password login enabled.
5. Turn off public sign-ups if you see an option like **Allow new users to sign up**.
6. Save.

Even if someone creates another account somehow, the database policies still block them because only Rawad's UUID can write.

## Step 9: Enable Realtime

The SQL tries to enable realtime automatically.

If phone/laptop does not update live:

1. In Supabase left sidebar, click **Database**.
2. Click **Publications** or **Replication**.
3. Find `supabase_realtime`.
4. Enable these tables:

```text
league_settings
friends
point_events
```

5. Save.

The site still works without realtime. A refresh will always load the saved data.

## Step 10: Use the website

1. Open the GitHub Pages URL.
2. Click **Admin login**.
3. Type Rawad's email.
4. Type Rawad's password.
5. Click **Login**.
6. Click **Add friend**.
7. Add a friend.
8. Click **Add points**.
9. Add or deduct points.
10. Open the site on your phone.

Your phone should see the same Supabase data.

## Local testing

Do not open `index.html` directly.

From inside the `rawads-league` folder:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## GitHub Pages

If the project is deployed from the repository root, and the files are inside the `rawads-league` folder, your URL may be:

```text
https://hadiezz12.github.io/rawads-league/rawads-league/
```

If you later move the files to the repository root, the URL becomes:

```text
https://hadiezz12.github.io/rawads-league/
```

## Security notes

- The anon/publishable key is okay in browser code.
- The service role key is not okay in browser code.
- Never paste the service role key into `config.js`.
- Rawad's password is stored by Supabase Auth, not in this repo.
- Hiding buttons is not security.
- Row Level Security is the real protection.

## Troubleshooting

### The page says Supabase is not configured

You did not edit `config.js`, or one value is wrong.

### Rawad can log in but cannot add friends

The UUID in SECTION 3 is probably wrong. Copy Rawad's UUID again from **Authentication** -> **Users**, replace it in SECTION 3, and run SECTION 3 again.

### My phone does not update instantly

Check Realtime in Supabase. If realtime is not enabled, refresh the phone page.

### Public visitors can edit

This should not happen if Row Level Security is enabled. Check Supabase policies. Public users should only have `select` policies.

### Old version keeps showing

The service worker may be cached. Hard refresh, clear site data, or wait a minute after GitHub Pages deploys.
