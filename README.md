# ZenExam web app

React + Vite. Talks only to the backend API (`../backend`).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api and /files to http://localhost:8787
```

| Script | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` / `npm run lint` | Checks |
| `node --experimental-strip-types scripts/check-assembler.ts` | Exam assembly self-check |

## Deploying on Vercel (free Hobby plan)

Import this repo in Vercel; `vercel.json` sets the build (`npm ci`, `npm run build`, output `dist`) and rewrites
`/api/*` to the Render backend (`https://zen-exam-api.onrender.com`). Because the browser only talks to the Vercel
domain, the session cookie is first-party: no CORS or cross-site cookie settings needed. If the Render service gets
a different URL, update the rewrite destination.

- Hobby can only deploy private repos from personal accounts, so this org repo is public. It contains no secrets.
- Images load straight from R2 through signed URLs; only JSON goes through the rewrite.

Code in `src/shared` is duplicated in the backend repo's `src/shared`; keep them identical.
