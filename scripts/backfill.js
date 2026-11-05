// One-off: import already-sent campaigns. Run locally with .env loaded:
//   node --env-file=.env scripts/backfill.js [count]
import { fetchCampaign, listSentCampaigns } from "../lib/mailchimp.js"
import { buildItem } from "../api/newsletter.js"
import { upsertNewsletter } from "../lib/framer.js"

const count = Number(process.argv[2] || 20)
const ids = await listSentCampaigns(process.env.MAILCHIMP_API_KEY, count)
console.log(`Found ${ids.length} sent campaigns`)

for (const id of ids.reverse()) {
  // oldest first so the collection order reads chronologically
  const campaign = await fetchCampaign(id, process.env.MAILCHIMP_API_KEY)
  const item = await buildItem(campaign)
  const r = await upsertNewsletter({ ...process.env, AUTO_PUBLISH: "false" }, item)
  console.log(`${r.action.padEnd(8)} ${item.date.slice(0, 10)}  ${item.title}`)
}
console.log("Done. Publish the site from Framer (or run with AUTO_PUBLISH=true once at the end).")
