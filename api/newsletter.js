// POST /api/newsletter
// Body (JSON): { "campaign_id": "<mailchimp campaign id>" }
// Header:      x-bridge-secret: <BRIDGE_SECRET>
//
// Zapier → this endpoint → Mailchimp API → cleaned HTML → Framer CMS "Newsletter" item.
// Libraries are loaded lazily inside the handler so a broken dependency produces a
// readable JSON error instead of a bare 500 from Vercel.

const REQUIRED = ["FRAMER_PROJECT_URL", "FRAMER_API_KEY", "FRAMER_COLLECTION_ID", "MAILCHIMP_API_KEY", "BRIDGE_SECRET"]

export async function buildItem(campaign) {
  const { cleanBody, extractHeroImage, excerpt, slugify } = await import("../lib/clean.js")
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
  const missing = REQUIRED.filter((k) => !process.env[k])

  if (req.method !== "POST") {
    // Health check. Loads each dependency so problems show up here, not in Zapier.
    const deps = {}
    for (const name of ["sanitize-html", "framer-api"]) {
      try {
        await import(name)
        deps[name] = "ok"
      } catch (e) {
        deps[name] = String(e?.message || e)
      }
    }
    return res.status(200).json({ status: "bridge up", node: process.version, missingEnv: missing, deps, usage: "POST { campaign_id } with x-bridge-secret header" })
  }

  if (missing.length) return res.status(500).json({ error: `Missing env: ${missing.join(", ")}` })

  if (req.headers["x-bridge-secret"] !== process.env.BRIDGE_SECRET) {
    return res.status(401).json({ error: "bad secret" })
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}
  const campaignId = body.campaign_id || body.id
  if (!campaignId) return res.status(400).json({ error: "campaign_id required" })

  try {
    const { fetchCampaign } = await import("../lib/mailchimp.js")
    const { upsertNewsletter } = await import("../lib/framer.js")

    const campaign = await fetchCampaign(campaignId, process.env.MAILCHIMP_API_KEY)

    const allowed = (process.env.ALLOWED_STATUSES || "sent").split(",").map((s) => s.trim())
    if (!allowed.includes(campaign.status)) {
      return res.status(200).json({ skipped: true, reason: `status=${campaign.status}`, campaign_id: campaignId })
    }

    const item = await buildItem(campaign)
    const result = await upsertNewsletter(process.env, item)
    return res.status(200).json({ ok: true, campaign_id: campaignId, ...result, title: item.title, image: item.imageUrl })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: String(err?.message || err), stack: String(err?.stack || "").split("\n").slice(0, 4) })
  }
}
