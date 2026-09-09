# New-Home Permit Radar — free self-refreshing website

This folder is a complete, free website that shows new-home construction permits in
Charlotte / Mecklenburg County — who's building, where, and their phone and email —
and **refreshes itself once a day automatically**. Your sales reps just open a link and
search. Nobody installs anything, and it costs nothing to run.

It works using two free GitHub features:
- **GitHub Actions** runs a little robot each morning that visits the county site and saves the latest permits.
- **GitHub Pages** hosts the search page at a web address you can share.

You only set this up **once** (about 30 minutes). After that it runs on its own.

---

## What's in this folder

```
site/index.html   ← the search page reps open
site/data.json    ← the permit data (the robot rewrites this daily; seeded with real data so it works today)
scraper/          ← the robot that pulls fresh permits
.github/workflows/refresh.yml  ← the daily schedule
README.md         ← this guide
```

---

## One-time setup

### 1. Make a free GitHub account
Go to **github.com** and sign up (free). If you already have one, sign in.

### 2. Create a new repository
- Click the **+** in the top-right → **New repository**.
- Name it something like **permit-radar**.
- Choose **Public** (this keeps Actions and Pages free and unlimited).
- Leave everything else as-is and click **Create repository**.

### 3. Upload these files
- On the new empty repository page, click **uploading an existing file** (the link in the middle), or the **Add file → Upload files** button.
- Open this folder on your computer, select **everything inside it** (the `site` folder, the `scraper` folder, the `.github` folder, and `README.md`), and **drag it all** into the upload area.
- At the bottom click **Commit changes**.
- Give it a minute; you should now see the `site`, `scraper`, and `.github` folders listed.

> Tip: if dragging the `.github` folder doesn't work, that's fine — see "If the daily refresh doesn't appear" below; the site still works without it, you just refresh by hand.

### 4. Turn on the website (GitHub Pages)
- In the repository, click **Settings** (top menu) → **Pages** (left menu).
- Under **Build and deployment → Source**, choose **Deploy from a branch**.
- Set **Branch** to **main** and the folder to **/site**, then click **Save**.
- Wait about a minute, then refresh the page. GitHub shows a green box with your live link, like:
  **`https://YOUR-USERNAME.github.io/permit-radar/`**
- Open that link — you should see the dashboard with today's real permits. **That's the link you give your reps.**

### 5. Turn on the daily refresh (permissions)
- Still in **Settings** → click **Actions** (left menu) → **General**.
- Scroll to **Workflow permissions**, choose **Read and write permissions**, and click **Save**.

### 6. Do the first refresh now (optional but nice)
- Click the **Actions** tab (top menu).
- Click **Refresh permit data** on the left, then **Run workflow** → **Run workflow** (green button).
- It takes a few minutes. When it finishes with a green check, your site has the very latest permits. From then on it runs every morning on its own.

**Done.** Bookmark your Pages link and share it with reps.

---

## Everyday use (for you and your reps)

Just open the link. Type in the **Search** box (a builder, a ZIP, a street) or click a
**builder chip** to filter. Click **open ↗** on any row to see the full county record.
**Export CSV** downloads whatever is currently on screen. The date at the top shows when it
last refreshed.

---

## Adjusting things

- **How far back it pulls:** open `.github/workflows/refresh.yml`, find `DAYS: "30"`, and change 30 to 7, 60, etc. Commit the change.
- **What time it refreshes:** in the same file, `cron: "0 11 * * *"` is 7 AM Eastern. (The number `11` is the UTC hour.)

## If the daily refresh doesn't appear or the data looks stale

- Go to the **Actions** tab and check the latest **Refresh permit data** run. A red X means the run failed — click it to see why. The most common cause is the county changing their website; if that happens, send me (Kristin's Claude session) the error and I'll fix the scraper.
- The site never goes blank on a failed refresh — it keeps showing the last good data.

## Good to know

- This reads **public records** — no login is ever required.
- It refreshes once a day, so it's current to within a day (not to the minute).
- Everything here is free on GitHub's normal tiers for a public repository.
