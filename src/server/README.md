# Self-hosting Blatt (optional)

Blatt works perfectly well as a file you double-click. Host it on your own server instead when you want:

- **your CV on every device**: edit on the laptop, carry on from the phone or another computer;
- **a private address** behind a **Google sign-in** that only you can pass.

It's the same `cv.html`. When a Blatt server serves the file, it notices and saves to that server as well as to the browser. Opened as a file, it behaves exactly as before.

Each server is for **one person** (one Google account). Pick a platform:

| | You need | Cost |
|---|---|---|
| [**Cloudflare Workers**](#option-a--cloudflare-workers) | A free Cloudflare account, Node.js on your computer | Free tier is plenty |
| [**Docker / any server**](#option-b--docker-or-any-server-with-nodejs) | A server or VPS with Docker or Node.js 20+, a domain with HTTPS | Whatever your server costs |

Both need a **Google sign-in client** first (step 1). It takes about 10 minutes.

---

## 1. Create the Google sign-in client

You need to know your server's address first: `https://blatt.<your-subdomain>.workers.dev` for Cloudflare (step A3 prints it), or your own domain such as `https://cv.example.com`.

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and create a project (e.g. *Blatt*).
2. Go to **APIs & Services → OAuth consent screen** (shown as *Google Auth Platform* in newer consoles) and click **Get started**:
   - App name: *Blatt*; support email: yours.
   - Audience: **External**.
   - Contact email: yours. Accept and **Create**.
3. Under **Audience → Test users**, add **your own Gmail address**. (Alternatively, click **Publish app**. Blatt only asks for your email address, so publishing needs no review from Google.)
4. Go to **Clients → Create client**:
   - Application type: **Web application**.
   - Authorized redirect URIs: your address + `/auth/callback`, e.g. `https://cv.example.com/auth/callback`.
   - **Create**, then copy the **Client ID** and **Client secret**.

You also need a long random **session secret**. Generate one with either of these:

```sh
openssl rand -base64 48
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Option A: Cloudflare Workers

You need [Node.js](https://nodejs.org/) 20+ on your computer and a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```sh
# A1. Get the code and go to the Cloudflare folder
git clone https://github.com/leandrorsampaio/Blatt.git
cd Blatt/src/server/cloudflare

# A2. Log in and create the database (one row: your Blatt data)
npx wrangler login
npx wrangler d1 create blatt
```

Copy the `database_id` it prints into `wrangler.toml`, replacing `PASTE-YOUR-DATABASE-ID-HERE`.

```sh
# A3. Deploy — prints your address, e.g. https://blatt.<your-subdomain>.workers.dev
npx wrangler deploy
```

Now finish [step 1](#1-create-the-google-sign-in-client) with that address, then set the settings as secrets:

```sh
# A4. Settings (each command asks for the value)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ALLOWED_EMAIL       # your Gmail address
npx wrangler secret put SESSION_SECRET      # the random string from step 1
```

Open your address. Google asks you to sign in, and then Blatt opens.

**Custom domain:** in the Cloudflare dashboard go to *Workers & Pages → blatt → Settings → Domains & Routes*, add the domain, then add `https://<domain>/auth/callback` as a redirect URI in Google.

**Updating:** `git pull`, then `npx wrangler deploy` from the same folder.

---

## Option B: Docker, or any server with Node.js

Google only accepts sign-ins over **HTTPS** (plain `http://` works only on `localhost`). Run Blatt behind something that provides HTTPS: a reverse proxy such as Caddy or nginx, or a platform such as Fly.io, Render or Railway that does it for you.

Create a settings file `blatt.env` (keep it private):

```sh
GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ALLOWED_EMAIL=you@gmail.com
SESSION_SECRET=<the random string from step 1>
PUBLIC_URL=https://cv.example.com
```

**With Docker** (from the repository root):

```sh
docker build -f src/server/node/Dockerfile -t blatt .
docker run -d --name blatt --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v blatt-data:/data --env-file blatt.env blatt
```

**Without Docker** (Node.js 20+, no `npm install` needed):

```sh
set -a; . ./blatt.env; set +a
node src/server/node/server.mjs       # listens on 127.0.0.1:8080
```

**HTTPS with Caddy:** Caddy gets the certificate automatically. A complete `Caddyfile`:

```
cv.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Your data is a single file, `blatt-data.json`. It lives in the `/data` volume (Docker) or in `DATA_DIR` (Node; default `src/server/node/data/`, which git ignores). Back that file up.

**Try it on your own computer first:** set `PUBLIC_URL=http://localhost:8080`, add `http://localhost:8080/auth/callback` as a redirect URI in Google, and open <http://localhost:8080>.

---

## Settings

| Setting | Required | What it is |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | From step 1 |
| `GOOGLE_CLIENT_SECRET` | yes | From step 1 |
| `ALLOWED_EMAIL` | yes | The one Google account allowed in |
| `SESSION_SECRET` | yes | Random string, at least 32 characters; signs the sign-in cookie |
| `PUBLIC_URL` | Node: yes · Cloudflare: no | The address people type, e.g. `https://cv.example.com` (a sub-path like `https://example.com/blatt` works too) |
| `PORT`, `HOST` | no | Node only: where to listen (default `127.0.0.1:8080`; the Docker image uses `0.0.0.0:8080`) |
| `DATA_DIR` | no | Node only: folder for `blatt-data.json` |
| `APP_HTML` | no | Node only: path to `cv.html` (default: the one in this repository) |

If a required setting is missing, the server shows a page listing which ones.

---

## Using it

- **The first device you open fills the server.** Every other device then loads the server's copy.
- **Saving is automatic.** The top bar shows *Saved to your server* (green). Changes go up a few seconds after you stop typing, and immediately on `Ctrl`/`Cmd` + `S`.
- **No connection?** Keep working. Changes stay in the browser and are sent once the server is reachable again.
- **Edited on two devices at once?** Blatt asks which version to keep instead of silently overwriting one.
- **Sign out** (top right) also removes the CV from that browser. It's safe on the server, so nothing personal stays on a shared computer.
- **Bringing an existing CV over:** in your local Blatt, go to *Configuration → Export Blatt backup* (one file per CV version, photo included) and *Designs → Export current*. Then import those files on your server in the same place.

## Security notes

- Only `ALLOWED_EMAIL` gets in. Everything, including the app page itself, is behind the sign-in.
- A sign-in lasts 30 days. To sign out **every** device at once, change `SESSION_SECRET`.
- Your data is stored as plain JSON on your server or in your Cloudflare D1 database. It isn't encrypted at rest, so treat the server like any place you keep personal documents.
- The server has no dependencies. All the code is in `core.mjs` plus one small adapter per platform, so it's quick to review.

## Limits

- **Cloudflare:** all your data, including the photo, must stay under about 1.9 MB (one database row). That's ample for many CV versions and a photo; Blatt warns you if you hit it.
- **Node:** up to 20 MB.

## For developers

```
src/server/
  core.mjs               ← the whole server: sign-in, sessions, data API, serves cv.html
  node/server.mjs        ← Node adapter: file storage + http server
  node/Dockerfile
  cloudflare/worker.mjs  ← Workers adapter: D1 storage, cv.html bundled as text
  cloudflare/wrangler.toml
  test/server.test.mjs   ← node --test src/server/test/server.test.mjs
```

`core.mjs` uses only Web-standard APIs (`Request`/`Response`, `fetch`, WebCrypto). Porting to another platform (Deno, Bun, Vercel, Netlify…) only takes a storage object with `get()` and `put(baseRev, record)`. See the contract at the top of `core.mjs`.

The data API is one JSON document with a revision number: `GET api/data` returns `{ rev, updatedAt, data }`, and `PUT api/data` takes `{ baseRev, data }`. It answers `409` if someone else saved first. The browser side lives in the *SERVER SYNC* section of `cv.html`.
