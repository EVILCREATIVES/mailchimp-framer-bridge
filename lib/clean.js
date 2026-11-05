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

/**
 * Hero image. Mailchimp templates put the logo first, and it carries no alt or
 * "logo" marker, so position is the only signal. Rule: take the widest content
 * image (the hero spans the full column; the logo sits in a narrower header
 * block). On a tie, prefer any image that is not the first one.
 */
export function extractHeroImage(html) {
  const re = /<img\b[^>]*>/gi
  const candidates = []
  let docIndex = 0 // position among all real (non-junk) images, logo included
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    if (imgIsJunk(tag)) continue
    const index = docIndex++
    const w = Number(attr(tag, "width") || 0)
    const h = Number(attr(tag, "height") || 0)
    if ((w && w < 200) || (h && h < 100)) continue
    if (/logo/i.test(tag)) continue
    candidates.push({ src: attr(tag, "src"), w, index })
  }
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0].src
  const maxW = Math.max(...candidates.map((c) => c.w))
  const widest = candidates.filter((c) => c.w === maxW)
  const pick = widest.find((c) => c.index !== 0) || widest[0]
  return pick.src
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

// Invisible characters Mailchimp pads the preheader with (U+034F, U+200C, U+00AD, nbsp…)
const INVISIBLE = /[͏​‌‍­  ⁠﻿\s]/g

/**
 * Paragraph-level junk from Mailchimp's newer builder, which has no footer class
 * names to key off. Matched on text content after tags are stripped.
 */
const JUNK_PARAGRAPH = [
  /^\s*$/,                                        // empty / whitespace-only
  /^view(\s+this)?\s+e?-?mail\s+in\s+(your\s+)?browser/i,
  /\*\|[A-Z_:]+\|\*/,                             // leftover merge tags *|LIST:ADDRESS|*
  /update\s+your\s+preferences|unsubscribe/i,
  /why\s+did\s+i\s+get\s+this/i,
  /^view$/i,                                      // link text Mailchimp puts under image buttons
  /^(copyright|©)\s*\d{4}/i,
]

function stripInline(s) {
  return s.replace(/<[^>]+>/g, "").replace(INVISIBLE, "").trim()
}

export function cleanBody(html, { heroSrc } = {}) {
  let out = preClean(html).replace(/<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi, (whole, slash, rawName) => {
    const name = RENAME[rawName.toLowerCase()] || rawName.toLowerCase()
    if (!KEEP.has(name)) return "" // unwrap: drop tag, keep content
    return rebuildTag(name, slash === "/", whole)
  })

  // The hero already sits in the Image field, and the logo (first image) is site
  // chrome, not content: drop both from the body.
  let imgIndex = 0
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    const i = imgIndex++
    const src = attr(tag, "src")
    if (i === 0 || (heroSrc && src === heroSrc)) return ""
    return tag
  })

  out = out
    .replace(/&nbsp;/g, " ")
    // paragraph-level junk (preheader padding, footer lines, merge tags, "View")
    .replace(/<(p|h[1-6]|li|blockquote)>([\s\S]*?)<\/\1>/gi, (whole, tag, inner) => {
      const text = stripInline(inner)
      const hasImg = /<img/i.test(inner)
      if (!hasImg && JUNK_PARAGRAPH.some((re) => re.test(text))) return ""
      return whole
    })
    // empty lists
    .replace(/<(ul|ol)>\s*<\/\1>/gi, "")
    // collapse whitespace noise
    .replace(/(<br>\s*){3,}/gi, "<br><br>")
    .replace(/^(\s*<br>\s*)+/i, "")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
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
