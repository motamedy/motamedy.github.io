# motamedy-api

A Cloudflare Worker for the site. It records rounds of the guessing game in a D1
(SQLite) database, and relays aircraft data and the ISS orbit so browsers get them
from one place, cached. It holds no secrets, so it is fine for this folder to be public.

## Deploy (once)

You need Node.js (`sudo pacman -S nodejs npm`) and a free Cloudflare account.

```sh
cd worker
npx wrangler login                       # opens the browser to sign in
npx wrangler d1 create motamedy          # prints a database_id
# paste that database_id into wrangler.toml
npx wrangler d1 execute motamedy --remote --file=schema.sql
npx wrangler deploy                      # prints https://motamedy-api.<you>.workers.dev
```

Then put that address in `js/config.js`:

```js
export const API_BASE = 'https://motamedy-api.<you>.workers.dev';
```

Check it:

```sh
curl https://motamedy-api.<you>.workers.dev/shannon/stats
```

## Notes

- Anyone can post a round, so the numbers could be gamed. The Worker only accepts
  words that are in the game and guess counts between 1 and 26.
- `*.workers.dev` addresses are sometimes filtered in Iran. If visitors there can't
  reach it, the game still works and keeps their rounds in a queue in the browser,
  which it sends later. A custom domain on the Worker avoids the filter.
- To read the raw rounds: `npx wrangler d1 execute motamedy --remote --command "SELECT * FROM rounds ORDER BY id DESC LIMIT 20"`.
