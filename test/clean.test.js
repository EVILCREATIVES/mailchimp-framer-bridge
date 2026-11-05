import assert from "node:assert/strict"
import { cleanBody, extractHeroImage, excerpt, slugify } from "../lib/clean.js"

// --- Classic template -------------------------------------------------------
const classic = `<!doctype html><html><head><title>x</title><style>.mcnTextContent{color:#202020}</style></head>
<body><!--[if gte mso 9]><xml></xml><![endif]-->
<span class="mcnPreviewText" style="display:none">Preheader text that should vanish</span>
<center><table border="0" cellpadding="0" cellspacing="0" width="100%" id="bodyTable">
<tr><td align="center"><a href="https://mailchi.mp/abc/view">View this email in your browser</a></td></tr>
<tr><td class="mcnImageContent"><img src="https://mcusercontent.com/x/images/logo.png" width="300" height="120" alt=""></td></tr>
<tr><td class="mcnImageContent"><img src="https://mcusercontent.com/x/images/hero.jpg" width="600" height="300" alt="Hero"></td></tr>
<tr><td class="mcnTextContent"><h1>Exploration update: Q4</h1>
<p>Our teams completed the <strong>satellite survey</strong> over the northern block. <a href="https://ccexplorations.com/geolab" target="_blank">See the GeoLab.</a></p>
<ul><li>Line one</li><li>Line two</li></ul>
<table><tr><td><p>Nested table paragraph survives.</p></td></tr></table>
<p>&nbsp;</p>
<img src="https://mcusercontent.com/x/images/inline-photo.jpg" width="600" height="400" alt="Site">
<img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-color-facebook-48.png" width="24" height="24"></td></tr>
<tr><td id="templateFooter"><p>Want to change how you receive these emails? <a href="https://x.list-manage.com/unsubscribe">Unsubscribe</a></p></td></tr>
</table></center>
<img src="https://x.list-manage.com/track/open.php?u=1&id=2&e=3" height="1" width="1"></body></html>`

{
  const hero = extractHeroImage(classic)
  assert.equal(hero, "https://mcusercontent.com/x/images/hero.jpg", "widest wins over first")
  const html = cleanBody(classic, { heroSrc: hero })
  assert.ok(!/<style|<table|<td|<center|<span/i.test(html), "wrappers removed")
  assert.ok(!/Preheader text/.test(html), "preheader removed")
  assert.ok(!/View this email/i.test(html), "browser-view link removed")
  assert.ok(!/open\.php/.test(html), "tracking pixel removed")
  assert.ok(!/Unsubscribe/.test(html), "footer removed")
  assert.ok(!/logo\.png/.test(html), "logo removed from body")
  assert.ok(!/hero\.jpg/.test(html), "hero removed from body (lives in Image field)")
  assert.ok(/inline-photo\.jpg/.test(html), "other content images kept")
  assert.ok(/<h1>Exploration update: Q4<\/h1>/.test(html), "heading kept")
  assert.ok(/<strong>satellite survey<\/strong>/.test(html), "inline formatting kept")
  assert.ok(/<ul><li>Line one<\/li>/.test(html), "lists kept")
  assert.ok(/Nested table paragraph survives/.test(html), "table content unwrapped")
  assert.ok(/rel="noopener"/.test(html), "links get rel")
  assert.ok(!/<p>\s*<\/p>/.test(html), "no empty paragraphs")
}

// --- New builder (mceImage etc.), mirrors the real CC campaign ---------------
const pad = "͏ ‌      ".repeat(200)
const modern = `<html><body>
<div style="display:none"><p>${pad}</p></div>
<div class="imageDropZone mceImage"><img src="https://mcusercontent.com/a/images/logo-hash.png" width="533.8" height="auto"></div>
<p> </p>
<div class="imageDropZone mceImage"><img src="https://mcusercontent.com/a/images/hero-hash.png" width="608" height="auto"></div>
<p>Bring more focus to your next round of field testing</p>
<h1>Stuff you should know</h1>
<p>If you have more ground than you can realistically test, deciding where to start can be a challenge.</p>
<div class="imageDropZone mceImage"><a href="https://ccexplorations.com/case"><img src="https://mcusercontent.com/a/images/photo-1.png" width="306" height="auto"></a></div>
<h4>Putting AMRT to the test</h4>
<p><a href="https://ccexplorations.com/case">Read the case study →</a></p>
<p><a href="https://ccexplorations.com/case">View</a></p>
<p>Best regards,<br>John Casey</p>
<p><a href="https://mailchi.mp/x">View email in browser</a><br>*|IFNOT:ARCHIVE_PAGE|**|LIST:ADDRESSLINE|**|END:IF|*<br><a href="https://x.list-manage.com/profile">update your preferences</a> or <a href="https://x.list-manage.com/unsubscribe">unsubscribe</a></p>
<img src="https://x.list-manage.com/track/open.php?u=1" width="1" height="1">
</body></html>`

{
  const hero = extractHeroImage(modern)
  assert.equal(hero, "https://mcusercontent.com/a/images/hero-hash.png", "widest image is the hero, not the logo")
  const html = cleanBody(modern, { heroSrc: hero })
  assert.ok(!/͏|‌/.test(html), "invisible preheader padding removed")
  assert.ok(!/logo-hash/.test(html), "logo not in body")
  assert.ok(!/hero-hash/.test(html), "hero not in body")
  assert.ok(/photo-1\.png/.test(html), "inline photo kept")
  assert.ok(!/<p>\s*View\s*<\/p>|<p><a[^>]*>View<\/a><\/p>/.test(html), "'View' paragraphs removed")
  assert.ok(!/ARCHIVE_PAGE|update your preferences|unsubscribe|View email in browser/i.test(html), "footer removed")
  assert.ok(/Read the case study/.test(html), "real links kept")
  assert.ok(/Best regards,<br>John Casey/.test(html), "sign-off kept")
  assert.ok(html.startsWith("<p>Bring more focus"), `body starts with real content, got: ${html.slice(0, 60)}`)
}

assert.equal(slugify("Exploration Update: Q4 — Nördlich!"), "exploration-update-q4-nordlich")
assert.ok(excerpt("", classic).startsWith("Exploration update: Q4"), "excerpt from html")

console.log("clean.js OK")
