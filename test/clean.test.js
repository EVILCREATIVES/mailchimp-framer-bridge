import assert from "node:assert/strict"
import { cleanBody, extractHeroImage, excerpt, slugify } from "../lib/clean.js"

// Representative Mailchimp "Classic" template output, abbreviated.
const sample = `<!doctype html><html><head><title>x</title><style>.mcnTextContent{color:#202020}</style></head>
<body><!--[if gte mso 9]><xml></xml><![endif]-->
<span class="mcnPreviewText" style="display:none">Preheader text that should vanish</span>
<center><table border="0" cellpadding="0" cellspacing="0" width="100%" id="bodyTable">
<tr><td align="center"><a href="https://mailchi.mp/abc/view">View this email in your browser</a></td></tr>
<tr><td class="mcnImageContent"><img src="https://mcusercontent.com/x/images/hero.jpg" width="600" height="300" alt="Hero"></td></tr>
<tr><td class="mcnTextContent"><h1>Exploration update: Q4</h1>
<p>Our teams completed the <strong>satellite survey</strong> over the northern block. <a href="https://ccexplorations.com/geolab" target="_blank">See the GeoLab.</a></p>
<ul><li>Line one</li><li>Line two</li></ul>
<table><tr><td><p>Nested table paragraph survives.</p></td></tr></table>
<p>&nbsp;</p>
<img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-color-facebook-48.png" width="24" height="24"></td></tr>
<tr><td id="templateFooter"><p>Want to change how you receive these emails? <a href="https://x.list-manage.com/unsubscribe">Unsubscribe</a></p></td></tr>
</table></center>
<img src="https://x.list-manage.com/track/open.php?u=1&id=2&e=3" height="1" width="1"></body></html>`

const html = cleanBody(sample)

assert.ok(!/<style|<table|<td|<center|<span/i.test(html), "wrappers removed")
assert.ok(!/Preheader text/.test(html), "preheader removed")
assert.ok(!/View this email/i.test(html), "browser-view link removed")
assert.ok(!/open\.php/.test(html), "tracking pixel removed")
assert.ok(!/Unsubscribe/.test(html), "footer removed")
assert.ok(/<h1>Exploration update: Q4<\/h1>/.test(html), "heading kept")
assert.ok(/<strong>satellite survey<\/strong>/.test(html), "inline formatting kept")
assert.ok(/<ul><li>Line one<\/li>/.test(html), "lists kept")
assert.ok(/Nested table paragraph survives/.test(html), "table content unwrapped")
assert.ok(/<img src="https:\/\/mcusercontent.com\/x\/images\/hero.jpg"/.test(html), "hero img kept")
assert.ok(/rel="noopener"/.test(html), "links get rel")

assert.equal(extractHeroImage(sample), "https://mcusercontent.com/x/images/hero.jpg")
assert.equal(slugify("Exploration Update: Q4 — Nördlich!"), "exploration-update-q4-nordlich")
assert.ok(excerpt("", sample).startsWith("Exploration update: Q4"), "excerpt from html")

console.log("clean.js OK\n")
console.log(html)
