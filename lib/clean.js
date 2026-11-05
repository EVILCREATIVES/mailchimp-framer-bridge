// Turns a Mailchimp campaign (table-soup email HTML) into clean article HTML
// that Framer's Formatted Text field can render, plus a hero image and excerpt.
// Pure regex, no dependencies.

const TRACKING_IMG = /(open\.php|\/track\/|mailchimp\.com\/track|list-manage\.com\/track|pixel)/i
const SOCIAL_IMG = /(social-block|\/icons\/|facebook|twitter|instagram|linkedin|youtube|tiktok)/i

const KEEP = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "em", "u", "s",
  "a", "img",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
])
const RENAME = { b: "strong", i: "em", strike: "s" }

/** Strip the chrome Mailchimp wraps around the content. */
function preClean(html) {
  return html
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Mailchimp footer block (unsubscribe / update prefs / "why did I get this")
    .replace(/<(table|td|div)[^>]*(mcnFooter|templateFooter|footerContainer)[^>]*>[\s\S]*$/i, "")
    // preheader (hidden preview text)
    .replace(/<(div|span)[^>]*(mcnPreviewText|preheader)[^>]*>[\s\S]*?<\/\1>/gi, "")
    // "View this email in your browser" lines
    .replace(/<a[^>]*>[^<]*view (this|it) (email )?in your browser[^<]*<\/a>/gi, "")
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null
}

function imgIsJunk(tag) {
  const src = attr(tag, "src") || ""
  if (!/^https?:\/\//i.test(src)) return true
  if (TRACKING_IMG.test(src) || SOCIAL_IMG.test(src)) return true
  const w = Number(attr(tag, "width") || 0)
  const h = Number(attr(tag, "height") || 0)
  return w === 1 || (w && w < 120) || (h && h < 60)
}

/** First meaningful image: not a tracking pixel, not tiny, not a social icon/logo. */
export function extractHeroImage(html) {
  const re = /<img\b[^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    if (imgIsJunk(tag)) continue
    const w = Number(attr(tag, "width") || 0)
    const h = Number(attr(tag, "height") || 0)
    if ((w && w < 200) || (h && h < 100)) continue
    if (/(logo)/i.test(tag)) continue
    return attr(tag, "src")
  }
  return null
}

function rebuildTag(name, closing, original) {
  if (closing) return `</${name}>`
  if (name === "a") {
    const href = attr(original, "href") || ""
    if (!/^(https?:|mailto:)/i.test(href)) return "" // drop anchors with junk hrefs, keep text
    const title = attr(original, "title")
    return `<a href="${href}"${title ? ` title="${title.replace(/"/g, "&quot;")}"` : ""} target="_blank" rel="noopener">`
  }
  if (name === "img") {
    if (imgIsJunk(original)) return ""
    const src = attr(original, "src")
    const alt = (attr(original, "alt") || "").replace(/"/g, "&quot;")
    return `<img src="${src}" alt="${alt}">`
  }
  if (name === "br" || name === "hr") return `<${name}>`
  return `<${name}>`
}

export function cleanBody(html) {
  let out = preClean(html).replace(/<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi, (whole, slash, rawName) => {
    const name = RENAME[rawName.toLowerCase()] || rawName.toLowerCase()
    if (!KEEP.has(name)) return "" // unwrap: drop tag, keep content
    return rebuildTag(name, slash === "/", whole)
  })

  out = out
    .replace(/&nbsp;/g, " ")
    // drop empty block elements left by tables
    .replace(/<(p|h[1-6]|li|blockquote)>\s*<\/\1>/gi, "")
    .replace(/<(p|h[1-6]|li|blockquote)>(\s|<br>)*<\/\1>/gi, "")
    // collapse whitespace noise
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/(<br>\s*){3,}/gi, "<br><br>")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return out
}

export function excerpt(plainText, html, max = 180) {
  let text = (plainText || "").trim()
  if (!text) text = cleanBody(html).replace(/<[^>]+>/g, " ")
  text = text
    .replace(/\s+/g, " ")
    .replace(/^view this email in your browser\s*/i, "")
    .replace(/\(?https?:\/\/\S+\)?/g, "")
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return cut.slice(0, cut.lastIndexOf(" ")) + "…"
}

export function slugify(input, max = 80) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "newsletter"
  )
}
