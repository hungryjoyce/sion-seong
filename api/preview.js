// Returns the rendered email HTML so the author can see exactly
// how the letter will look in their inbox. No database writes, no
// email sent. Accepts either POST JSON or GET query string.

import { buildEmailHtml } from "./_email.js";

const ALLOWED_STAMPS = new Set([
  "Japan", "Paris", "Hawaii", "Canada", "Morocco", "New Zealand"
]);

function readInput(req) {
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    return body;
  }
  return req.query || {};
}

export default async function handler(req, res) {
  const { letter, year, stampLabel } = readInput(req);

  const safeLetter = typeof letter === "string" && letter.trim()
    ? letter.slice(0, 20000)
    : "Dear future me,\n\nThis is a preview of what your letter will look like when it arrives.\n\nWith love from past you.";

  const nowYear = new Date().getUTCFullYear();
  const y = parseInt(year, 10);
  const deliveryYear = Number.isInteger(y) && y > nowYear ? y : nowYear + 1;

  const stamp = (typeof stampLabel === "string" && ALLOWED_STAMPS.has(stampLabel))
    ? stampLabel : "Japan";

  const writtenDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });

  const html = buildEmailHtml({
    letter: safeLetter,
    writtenDate,
    deliveryYear,
    stampLabel: stamp
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(html);
}
