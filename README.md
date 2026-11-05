# Mailchimp → Zapier → Framer CMS bridge

Every sent Mailchimp campaign becomes an item in the **Newsletter** collection of the
CC EXPLORATIONS Framer project (`/newsletter` list page + `/newsletter/:slug` detail page,
both already built).

```
Mailchimp (campaign sent)
   └─ Zapier trigger "New Campaign"
        └─ Zapier action "Webhooks by Zapier → POST"  { campaign_id }
             └─ this service  (Vercel function)
                  ├─ Mailchimp API: campaign meta + HTML
                  ├─ strip email chrome → clean article HTML, hero image, excerpt
                  └─ Framer Server API: upsert item in "Newsletter"
                        Title, Summary, Image, Slug, Content, Link, Date
```

Why a bridge: Zapier has no Framer app. Framer's supported write path is the
Server API (`framer-api`, WebSocket + project API key), which Zapier can't speak
directly. The function is ~150 lines and owns the one thing Zapier can't do well
anyway: turning table-soup email HTML into something a Formatted Text field renders.

## Field mapping

| Framer field | Source |
|---|---|
| Title | campaign subject line |
| Summary | preview text, else first 180 chars of plain text |
| Image | first content image ≥200px wide (tracking pixels, logos, social icons skipped) |
| Slug | `slugified-subject-<web_id>` — stable, so re-running updates instead of duplicating |
| Content | campaign HTML, cleaned (no `<style>`, tables unwrapped, footer/unsubscribe/preheader/"view in browser" removed) |
| Link | Mailchimp hosted archive URL (fallback / "view original") |
| Date | campaign send time |

Fields are looked up **by name** at runtime. Renaming one in Framer makes the
bridge fail loudly instead of writing to the wrong column.

## 1. Deploy

```bash
npm install
npx vercel          # or: push to GitHub and import in Vercel
```

Environment variables (Vercel → Project → Settings → Environment Variables; see `.env.example`):

| Var | Where to get it |
|---|---|
| `FRAMER_PROJECT_URL` | `https://framer.com/projects/inxuXyPMMiEsqy0SU6sr` |
| `FRAMER_API_KEY` | Framer → Site Settings → General → API → Create key |
| `FRAMER_COLLECTION_ID` | `yBYV9SneS` (the Newsletter collection) |
| `MAILCHIMP_API_KEY` | Mailchimp → Account → Extras → API keys |
| `BRIDGE_SECRET` | any long random string; Zapier sends it back as a header |
| `CREATE_AS_DRAFT` | `true` if someone should review in Framer before it's live |
| `AUTO_PUBLISH` | `true` to publish + deploy the site after each import |

Endpoint: `https://<your-deployment>.vercel.app/api/newsletter`

### Publish behaviour

CMS items are not live on the site until the site is published. Pick one:

- `AUTO_PUBLISH=true`, `CREATE_AS_DRAFT=false` — fully automatic. Campaign sent → live on `/newsletter` within a minute. Note this publishes **everything** currently unpublished in the project, so don't leave half-finished canvas work on `main`.
- `AUTO_PUBLISH=false` — item lands in the CMS; a human hits Publish in Framer. Safer while the site is still awaiting stakeholder approval.

## 2. Zap

1. **Trigger** — Mailchimp → *New Campaign*. Connect the account, choose the audience.
2. **Action** — Webhooks by Zapier → *POST*
   - URL: `https://<your-deployment>.vercel.app/api/newsletter`
   - Payload Type: `json`
   - Data: `campaign_id` → *Campaign ID* from step 1
   - Headers: `x-bridge-secret` → the value of `BRIDGE_SECRET`
3. Test the step. Response you want:
   ```json
   { "ok": true, "action": "created", "slug": "…", "published": false, "title": "…", "image": "https://…" }
   ```
   `{ "skipped": true, "reason": "status=save" }` means the trigger fired on a draft campaign; it will fire again on send. (Set `ALLOWED_STATUSES=sent` — the default — to keep it that way.)

That's the whole Zap. No Formatter steps, no second Mailchimp call — the bridge does the fetch and the cleanup.

## 3. Backfill already-sent campaigns

```bash
node --env-file=.env scripts/backfill.js 20   # last 20 sent campaigns, oldest first
```
Then publish from Framer (or run once with `AUTO_PUBLISH=true`).

## 4. Test the cleaner offline

```bash
npm run test:clean
```

## Notes

- Re-sending a POST for the same campaign **updates** the existing item (matched on slug). Safe to retry.
- Mailchimp click-tracking redirect links are left intact (they still resolve); only the open-tracking pixel is dropped.
- Images stay hosted on `mcusercontent.com`; Framer ingests the URL and re-hosts the image on its CDN on import.
- The Framer API key is bound to this one project. For another site, deploy a second copy with its own key and collection ID.
