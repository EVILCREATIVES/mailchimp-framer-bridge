// POST /api/newsletter
// Body (JSON): { "campaign_id": "<mailchimp campaign id>" }
// Header:      x-bridge-secret: <BRIDGE_SECRET>
//
// Zapier → this endpoint → Mailchimp API → cleaned HTML → Framer CMS "Newsletter" item.

import { fetchCampaign } from "../lib/mailchimp.js"
import { cleanBody, extractHeroImage, excerpt, slugify } from "../lib/clean.js"
import { upsertNewsletter } from "../lib/framer.js"

const REQUIRED = ["FRAMER_PROJECT_URL", "FRAMER_API_KEY", "FRAMER_COLLECTION_ID", "MAILCHIMP_API_KEY", "BRIDGE_SECRET"]

export function buildItem(campaign) {
  const html = cleanBody(campaign.html)
  return {
    // stable slug keyed on the campaign so re-runs update instead of duplicating
    slug: `${slugify(campaign.subject || campaign.title)}-${campaign.webId || campaign.id}`.slice(0, 96),
    title: campaign.subject || campaign.title,
    summary: campaign.previewText || excerpt(campaign.plainText, campaign.html),
    imageUrl: extractHeroImage(campaign.html),
    html,
    link: campaign.archiveUrl,
    date: new Date(campaign.sendTime).toISOString(),
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" })

  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) return res.status(500).json({ error: `Missing env: ${missing.join(", ")}` })

  if (req.headers["x-bridge-secret"] !== process.env.BRIDGE_SECRET) {
    return res.status(401).json({ error: "bad secret" })
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}
  const campaignId = body.campaign_id || body.id
  if (!campaignId) return res.status(400).json({ error: "campaign_id required" })

  try {
    const campaign = await fetchCampaign(campaignId, process.env.MAILCHIMP_API_KEY)

    const allowed = (process.env.ALLOWED_STATUSES || "sent").split(",").map((s) => s.trim())
    if (!allowed.includes(campaign.status)) {
      return res.status(200).json({ skipped: true, reason: `status=${campaign.status}`, campaign_id: campaignId })
    }

    const item = buildItem(campaign)
    const result = await upsertNewsletter(process.env, item)
    return res.status(200).json({ ok: true, campaign_id: campaignId, ...result, title: item.title, image: item.imageUrl })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
