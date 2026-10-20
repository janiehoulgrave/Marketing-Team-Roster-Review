# Roster Review: setup

About 20 minutes the first time. Do it in this order.

## 1. Create the Firebase project

Use your personal Google account (the one you use for the SDS project).

1. Go to console.firebase.google.com and click **Create a project**. Name it `roster-review`. You can turn Google Analytics off.
2. On the project home page, click the **</>** (Web) icon to add a web app. Name it `Roster Review`. Leave "Firebase Hosting" unchecked.
3. Firebase shows a block of code with `const firebaseConfig = { ... }`. Copy the six values into **src/firebaseConfig.js**, replacing each `PASTE_HERE`. Keep the quote marks.

## 2. Turn on Google sign-in

1. Left menu: **Build > Authentication > Get started**.
2. **Sign-in method** tab > **Google** > Enable. Pick your email as the support email. Save.

## 3. Create the database and lock it down

1. Left menu: **Build > Firestore Database > Create database**.
2. Location: **nam5 (United States)** or **us-east4**. Start in **production mode**.
3. Open the **Rules** tab. Delete everything there, paste the full contents of **firestore.rules** from this project, and click **Publish**.

The rules are what keep reviews private. Staff can only read and edit their own reviews. You, Ariel, and Sarah can read everyone's but can't change anyone else's. Nobody can delete a review.

## 4. Put the code on GitHub

1. Create a new **private** repository called `roster-review`.
2. Click **uploading an existing file** and drag in everything from this zip: `index.html`, `package.json`, `vite.config.js`, `firestore.rules`, `SETUP.md`, `.gitignore`, and the whole `src` folder. Commit.

## 5. Deploy on Vercel

1. vercel.com > **Add New > Project** > import the `roster-review` repo.
2. Vercel detects **Vite** on its own. Leave the settings alone and click **Deploy**.
3. When it finishes, copy the address, for example `roster-review.vercel.app`.

## 6. Allow that address to sign in

Back in Firebase: **Authentication > Settings > Authorized domains > Add domain**. Paste the Vercel address without `https://`. If you later add a janienation.com subdomain, add that here too.

## 7. Load the roster

1. Open the Vercel address and sign in with your compass.com account.
2. Go to **Admin > Roster data** and upload the DMV Agent Directory export (.xlsx).
3. Check the preview. It should show 135 teams and a count for each person. Then click **Replace roster with this file**.

When the directory changes, upload a new export the same way. Answers stay with each team as long as the team name doesn't change.

## 8. Check the staff emails before you invite anyone

The emails in **src/config.js** and **firestore.rules** were filled in using the firstname.lastname@compass.com pattern. Confirm each one. If an email is wrong, that person will see a "No access yet" screen. Any change must be made in both files, and the rules must be published again in Firebase.

## Quick test

1. Sign in as yourself. You should see **My roster** with 16 teams and an **Admin** tab.
2. Answer one question on a card and wait for "Saved just now".
3. Go to **Admin > Staff progress**, click your name, and check that the answer appears.
4. Ask Ariel to sign in. She should see her 6 teams and the Admin tab. Sarah should see only Admin.

## Making changes later

Edit files in GitHub (or upload replacements). Vercel redeploys on its own within a minute or two.

- Question wording and options: **src/questions.js**
- Roles and starting benchmark ranges for the re-org: **src/config.js** (ROLES and STAFF_ROLE)
- Who has access: **src/config.js** and **firestore.rules** (both)

## Re-org tab

Admin > Re-org is a shared draft that only you, Ariel and Sarah can see. Every move, second MA change and benchmark edit saves for all three of you within a second or two. Nothing in the directory changes; when you're happy with the draft, use Copy change list and update the directory yourselves.

If two people change the draft at the exact same moment, the last save wins, so talk before you both rearrange at once.

The re-org needs the updated **firestore.rules** published in Firebase (it adds the admin-only `reorg` section).
