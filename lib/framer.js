// Framer Server API — upsert a campaign into the Newsletter collection.

import { connect } from "framer-api"

// Field names in the collection → keys we fill. Resolved to IDs at runtime by name,
// so renaming a field in Framer breaks loudly instead of silently.
const FIELD_NAMES = {
  title: "Title",
  summary: "Summary",
  image: "Image",
  content: "Content",
  link: "Link",
  date: "Date",
}

function fieldIndex(fields) {
  const byName = new Map(fields.map((f) => [f.name.trim().toLowerCase(), f]))
  const out = {}
  for (const [key, name] of Object.entries(FIELD_NAMES)) {
    const f = byName.get(name.toLowerCase())
    if (!f) throw new Error(`Collection has no field named "${name}"`)
    out[key] = f
  }
  return out
}

/**
 * @param {object} env  { FRAMER_PROJECT_URL, FRAMER_API_KEY, FRAMER_COLLECTION_ID, CREATE_AS_DRAFT, AUTO_PUBLISH }
 * @param {object} item { slug, title, summary, imageUrl, html, link, date }
 * @returns {{ action: "created"|"updated", slug, published: boolean }}
 */
export async function upsertNewsletter(env, item) {
  const framer = await connect(env.FRAMER_PROJECT_URL, env.FRAMER_API_KEY)
  try {
    const collection = await framer.getCollection(env.FRAMER_COLLECTION_ID)
    if (!collection) throw new Error(`Collection ${env.FRAMER_COLLECTION_ID} not found in project`)

    const fields = await collection.getFields()
    const F = fieldIndex(fields)

    const fieldData = {
      [F.title.id]: { type: "string", value: item.title },
      [F.summary.id]: { type: "string", value: item.summary },
      [F.content.id]: { type: "formattedText", value: item.html, contentType: "html" },
      [F.link.id]: { type: "link", value: item.link || null },
      [F.date.id]: { type: "date", value: item.date },
    }
    if (item.imageUrl) fieldData[F.image.id] = { type: "image", value: item.imageUrl, alt: item.title }

    const existing = (await collection.getItems()).find((i) => i.slug === item.slug)
    const draft = String(env.CREATE_AS_DRAFT).toLowerCase() === "true"

    let action
    if (existing) {
      await existing.setAttributes({ fieldData })
      action = "updated"
    } else {
      await collection.addItems([{ slug: item.slug, draft, fieldData }])
      action = "created"
    }

    let published = false
    if (String(env.AUTO_PUBLISH).toLowerCase() === "true" && !draft) {
      const result = await framer.publish()
      await framer.deploy(result.deployment.id)
      published = true
    }

    return { action, slug: item.slug, published }
  } finally {
    await framer.disconnect()
  }
}
