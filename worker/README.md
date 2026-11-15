# Green AI backend

A small Cloudflare Worker that sits between the website and the Anthropic API.
It keeps your API key secret (it never reaches the browser) and streams
Green's replies back to the chat.

## One-time setup (about 10 minutes, free Cloudflare plan is enough)

1. Get an Anthropic API key at https://console.anthropic.com (Settings → API keys).
2. Create a free Cloudflare account at https://dash.cloudflare.com.
3. On your computer, in this `worker` folder:

   ```bash
   npm install
   npx wrangler login                        # opens a browser to sign in
   npx wrangler secret put ANTHROPIC_API_KEY # paste your key when asked
   npx wrangler deploy
   ```

   The last command prints a URL like `https://green-ai.<your-name>.workers.dev`.

4. Open `../index.html`, find `const API_URL = "";` and set it to that URL plus `/chat`:

   ```js
   const API_URL = "https://green-ai.<your-name>.workers.dev/chat";
   ```

   Commit and push. GitHub Pages will pick up the change in a minute or two.

## Allowed websites

Only the sites listed in `ALLOWED_ORIGINS` in `wrangler.toml` can use the
worker. It starts with `https://samuel12-lab.github.io` (GitHub Pages) and
`http://localhost:8000` (local testing). When you add a custom domain, add it
there too (for example `https://www.greentech.earth`) and run `npx wrangler deploy` again.

## Testing locally

```bash
# terminal 1, in worker/
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars   # .dev.vars is git-ignored
npx wrangler dev --port 8787

# terminal 2, in the repo root
python3 -m http.server 8000
```

Then set `API_URL` to `http://localhost:8787/chat` and open http://localhost:8000.

## Costs and limits

Each message is a paid API call. The worker uses `claude-opus-5-5` with low
effort, keeps the last 30 messages of a conversation and caps each message at
4,000 characters. To protect your bill, set a monthly spend limit in the
Anthropic Console, and consider Cloudflare's rate-limiting rules if the site
gets busy.
