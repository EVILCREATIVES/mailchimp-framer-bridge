// Mailchimp Marketing API v3 — minimal client. Only what the bridge needs.

function dcFromKey(key) {
  const m = /-([a-z]{2}\d+)$/.exec(key || "")
  if (!m) throw new Error("MAILCHIMP_API_KEY must end with the datacenter suffix, e.g. ...-us21")
  return m[1]
}

async function mc(path, apiKey) {
  const dc = dcFromKey(apiKey)
  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`anystring:${apiKey}`).toString("base64"),
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Mailchimp ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/**
 * Returns a normalized campaign:
 * { id, status, title, subject, previewText, sendTime, archiveUrl, html, plainText }
 */
export async function fetchCampaign(campaignId, apiKey) {
  const [meta, content] = await Promise.all([
    mc(`/campaigns/${encodeURIComponent(campaignId)}`, apiKey),
    mc(`/campaigns/${encodeURIComponent(campaignId)}/content`, apiKey),
  ])
  return {
    id: meta.id,
    webId: meta.web_id,
    status: meta.status, // save | paused | schedule | sending | sent
    title: meta.settings?.title || meta.settings?.subject_line || `Campaign ${meta.id}`,
    subject: meta.settings?.subject_line || "",
    previewText: meta.settings?.preview_text || "",
    sendTime: meta.send_time || meta.create_time || new Date().toISOString(),
    archiveUrl: meta.long_archive_url || meta.archive_url || "",
    html: content.html || "",
    plainText: content.plain_text || "",
  }
}

/** Lists sent campaigns, newest first. Used by scripts/backfill.js. */
export async function listSentCampaigns(apiKey, count = 50) {
  const data = await mc(`/campaigns?status=sent&count=${count}&sort_field=send_time&sort_dir=DESC`, apiKey)
  return (data.campaigns || []).map((c) => c.id)
}
