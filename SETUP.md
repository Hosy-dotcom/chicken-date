# Set up your shared shopping list

You only need **Firebase** for saved data and **Vercel** for the website. Neither you nor your date will log in to the shopping page. These steps are a one-time setup for you as its owner.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and sign in with your Google account.
2. Choose **Create a project** (or **Add project**).
3. Name it something like `chicken-date` and continue. You can leave Google Analytics disabled; this app does not use it.
4. Wait for the project to finish creating, then open it.

## 2. Turn on Firestore

1. In the project menu, open **Build → Firestore Database**.
2. Click **Create database**.
3. If asked for an edition, select **Standard edition**. Use the database named **(default)**.
4. Choose a location near you and continue. Keep **Production mode** if asked. We will replace its rules in the next step.
5. Wait for the database to finish creating.

Do not choose Realtime Database: this project uses **Cloud Firestore**. Do not enable Authentication, create accounts, or set up email. [Firebase database documentation](https://firebase.google.com/docs/firestore/manage-databases)

## 3. Paste the supplied database rules

1. In VS Code, open the file `firestore.rules` in your `chicken-date` folder.
2. Select and copy the entire file.
3. In Firebase, open **Firestore Database → Rules**.
4. Replace all the editor's existing text with the copied rules.
5. Click **Publish**.

The rules allow opening a specific list with a 32-character random ID and deny browsing all lists. They allow list updates only with an incremented revision and at most 200 ingredients. Reset clears the items but keeps the document and shared URL.

The link itself is access: **anyone who receives the full link can read and edit that list**. There are no passwords or user identities, so don't post the link publicly. This is intentional for this small shared list, not an account-protected service. Firebase's web API key is public configuration; it is not the secret list ID. [Firebase web API keys](https://firebase.google.com/docs/projects/api-keys)

## 4. Register a web app and get three values

1. Go to **Project overview**.
2. Click the **Web** icon, which looks like `</>`. If it is not shown, use the gear → **Project settings → General → Your apps → Add app**.
3. Give the app a nickname, such as `Chicken shopping`.
4. Leave Firebase Hosting unchecked; Vercel will host the website.
5. Click **Register app**.
6. Firebase shows a code snippet containing `firebaseConfig`. Keep it open or copy its values somewhere temporarily.

You need these three values:

| Value in Firebase's `firebaseConfig` | Environment-variable name used by this website |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

Copy only each value, without the surrounding quotes or trailing comma. You do not need to paste Firebase's JavaScript snippet into your HTML. You do not need `authDomain`, a service-account file, an admin key, SMTP, or Firebase Hosting. [Register a Firebase web app](https://firebase.google.com/docs/web/setup)

## 5. Put the website on GitHub

If your `chicken-date` folder is already in a GitHub repository, skip to step 6.

1. Open the **chicken-date folder itself** in VS Code using File → Open Folder.
2. Open the **Source Control** panel on the left and choose **Initialize Repository**.
3. Stage the files using the `+` button, enter a commit message such as `Shared shopping list`, and commit. If VS Code asks for your Git name/email, follow its prompts.
4. Choose **Publish to GitHub**, sign in when prompted, and create a private repository.

The included `.gitignore` keeps `node_modules`, `.env.local` and generated `dist` files out of Git. You do not need to upload them manually.

## 6. Deploy on Vercel

1. Open [Vercel](https://vercel.com/) and sign in with GitHub.
2. Choose **Add New → Project**.
3. Import the GitHub repository you just created.
4. Make sure the **Root Directory** contains `package.json`, `index.html` and `src`. If you uploaded a larger parent folder, select its nested `chicken-date` folder here.
5. Select **Vite** as the framework. Use Node.js **22 or newer**. Keep the build command `npm run build` and output directory `dist`; `vercel.json` already declares these.
6. Open **Environment Variables** before deploying. Add all three names from step 4 with their corresponding values.
7. Click **Deploy**, wait for it to finish, and open the resulting HTTPS website URL.

If you add or change environment variables after deploying, go to Deployments and **Redeploy**. Vite embeds these values during the build. [Vite deployment on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

You do not need to run a separate server or deploy a Firebase function. The website connects directly to Firestore.

## 7. Open and share your list

1. Open the deployed website. Its address will automatically gain `?list=` followed by a long random ID.
2. Press **Load chicken ingredients** to start with your original ingredients, or **+ Add ingredient** to start your own list. The Firestore document is created on the first saved change—there is no need to create collections manually.
3. Press **Copy shared link** and send it to your date.
4. Your date opens that exact link. Both of you now see the same list, without signing in.
5. Bookmark the full link on both phones. If the Copy button cannot access the clipboard, a text box appears so you can select and copy it manually.

**Share the full link, including `?list=…`.** Opening only the bare website address on a new phone creates a different empty list. The same browser remembers your last list when possible, but the full bookmarked URL is the reliable way to return after clearing browser data.

Check it once together: add an item on one phone and watch it appear on the other, then check it off, edit it, delete it, and refresh both pages. Close and reopen the browsers: the same URL restores the list from Firestore.

## Everyday use

- Tick ingredients already at home to remove them from shopping.
- Tap shopping items to move them into the inventory; × returns them.
- Use ⇄ to change the shop.
- Use the pencil next to an ingredient to edit its name, quantity/notes or shop, or delete it.
- The pantry-check button still opens the judging-cat notification for missing basics.
- **Start a Fresh List** asks for confirmation, then clears ingredients and inventory on both phones. The shared URL stays the same. Load the chicken ingredients again if wanted.

Firestore's listener sends changes automatically; you don't need to refresh. Transactions prevent one phone from silently replacing a newer version. If you both change the list at the same moment, the second person may see a short message asking them to review and retry. [Realtime listeners](https://firebase.google.com/docs/firestore/query-data/listen), [Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)

Saved items stay in Firestore even when both browsers are closed or phones restart. Editing needs an internet connection. The page pauses edits while offline so it does not imply an unsaved change reached your date.

## Optional: edit and preview in VS Code

Install Node.js 22 or newer. In the VS Code terminal inside `chicken-date`:

```sh
npm ci
```

Copy `.env.example` to a new file named `.env.local` in the same folder. Replace the placeholders with the three Firebase values:

```dotenv
VITE_FIREBASE_API_KEY=your-apiKey-value
VITE_FIREBASE_PROJECT_ID=your-projectId-value
VITE_FIREBASE_APP_ID=your-appId-value
```

Then run:

```sh
npm run dev
```

Open the localhost URL printed in the terminal. Use this instead of double-clicking `index.html` or using Live Server. Restart the dev server if you change `.env.local`. Share the deployed Vercel URL with your date, not localhost.

## If something does not work

| What you see | What to check |
| --- | --- |
| “One-time setup needed” | All three environment variables are present and spelled exactly as above; redeploy Vercel after changing them. |
| “permission-denied” | Publish the complete `firestore.rules` file in this exact Firebase project's default Firestore database. |
| Different lists on each phone | Compare the full URLs. They must have the same `list` value. Use Copy shared link again. |
| “This shared link is incomplete” | Copy the entire link again; the ID must be 32 lowercase letters/numbers. |
| Page shows the old login version | Close old website/app windows and reopen; the previous service worker may be waiting for old tabs to close. |
| “Offline” or “Connecting” | Restore the connection. The listener reconnects automatically. If a Reconnect button appears, press it. |

The phone layout and existing styling have been retained, including touch-sized controls and Safari-friendly clipboard fallback. Use the full shared URL in Safari on iPhone or a current Android browser. If you use the optional Home Screen installation, bookmark the full shared link too: browser and installed-app storage can differ, so confirm that both show the same `list` ID.

## What has been tested

The production build and 10 local tests pass: item operations, reset, stale-edit rejection, input validation, shared-ID generation, safe text rendering, page element references and removal of login controls. These are local code tests, not a live Firestore or iPhone test. Firestore rules have been prepared but not run against your project or the emulator. Actual two-phone synchronization and Safari behaviour must be checked after the Firebase/Vercel setup above.
