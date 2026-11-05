// Turns a Mailchimp campaign (table-soup email HTML) into clean article HTML
// that Framer's Formatted Text field can render, plus a hero image and excerpt.

import sanitizeHtml from "sanitize-html"

const TRACKING_IMG = /(open\.php|\/track\/|mailchimp\.com\/track|list-manage\.com\/track|pixel)/i

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s",
  "a", "img",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
]

/** Strip the chrome Mailchimp wraps around the content. */
function preClean(html) {
  return (
    html
      // kill head, styles, scripts, comments, MSO conditionals
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
  )
}

/** First meaningful image: not a tracking pixel, not a 1×1, not a social icon. */
export function extractHeroImage(html) {
  const re = /<img\b[^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!src || !/^https?:\/\//i.test(src)) continue
    if (TRACKING_IMG.test(src)) continue
    const w = Number(/\bwidth=["']?(\d+)/i.exec(tag)?.[1] || 0)
    const h = Number(/\bheight=["']?(\d+)/i.exec(tag)?.[1] || 0)
    if ((w && w < 200) || (h && h < 100)) continue
    if (/(social|icon|logo|facebook|twitter|instagram|linkedin|youtube)/i.test(tag)) continue
    return src
  }
  return null
}

export function cleanBody(html) {
  const sanitized = sanitizeHtml(preClean(html), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // tables, spans, centers, fonts… are unwrapped: content kept, tag dropped
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        const src = frame.attribs?.src || ""
        const w = Number(frame.attribs?.width || 0)
        const h = Number(frame.attribs?.height || 0)
        const tiny = (w && w < 120) || (h && h < 60)
        const social = /(social-block|\/icons\/|facebook|twitter|instagram|linkedin|youtube|tiktok)/i.test(src)
        return TRACKING_IMG.test(src) || w === 1 || tiny || social
      }
      // drop empty inline/para tags
      if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"].includes(frame.tag)) {
        return !frame.text.trim() && !/<img/i.test(frame.innerHTML || "")
      }
      return false
    },
    transformTags: {
      a: (tag, attribs) => {
        // strip Mailchimp click-tracking redirectors when the real URL is recoverable
        const href = attribs.href || ""
        const unwrapped = /list-manage\.com\/track\/click/.test(href) ? null : href
        return { tagName: "a", attribs: { ...attribs, href: unwrapped || href, rel: "noopener" } }
      },
      b: "strong",
      i: "em",
    },
  })

  return (
    sanitized
      // collapse whitespace noise left by tables
      .replace(/\s*\n\s*/g, "\n")
      .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  )
}

export function excerpt(plainText, html, max = 180) {
  let text = (plainText || "").trim()
  if (!text) {
    text = cleanBody(html).replace(/<[^>]+>/g, " ")
  }
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
