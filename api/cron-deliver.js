// Daily cron, configured in vercel.json to run at 09:00 UTC.
// Finds letters whose delivery date has arrived and sends them via
// Brevo's transactional email API (no `scheduledAt` — immediate send).
//
// Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
// so we reject requests that don't carry that header.

import { sql, ensureSchema } from "./_db.js";
import { buildEmailHtml } from "./_email.js";

const FROM_EMAIL = "no.reply.lettersforyou@gmail.com";
const FROM_NAME = "A Letter To Your Future Self";

// Brevo free tier caps at 300/day. Leave headroom.
const MAX_PER_RUN = 250;
const MAX_ATTEMPTS = 5;

function formatWrittenDate(isoDate) {
  // isoDate is a YYYY-MM-DD string (or Date) from Postgres.
  const d = isoDate instanceof Date ? isoDate : new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
}

async function sendOne(row, apiKey) {
  const deliveryYear = (row.deliver_on instanceof Date
    ? row.deliver_on.getUTCFullYear()
    : parseInt(String(row.deliver_on).slice(0, 4), 10));
  const writtenDate = formatWrittenDate(row.written_on);
  const html = buildEmailHtml({
    letter: row.letter,
    writtenDate,
    deliveryYear,
    stampLabel: row.stamp_label
  });
  const payload = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: row.email }],
    subject: "A letter to you — open today 🕰️",
    htmlContent: html
  };
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const data = await resp.json();
      detail = data.message || data.code || "";
    } catch (_) { /* ignore */ }
    throw new Error(`Brevo ${resp.status}: ${detail}`);
  }
}

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const authed = expected && req.headers.authorization === `Bearer ${expected}`;
  if (!authed) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "BREVO_API_KEY not set" });
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error("schema init failed:", err);
    return res.status(500).json({ error: "DB unavailable" });
  }

  const due = await sql`
    SELECT id, email, deliver_on, letter, stamp_label, written_on, attempts
    FROM letters
    WHERE sent_at IS NULL
      AND attempts < ${MAX_ATTEMPTS}
      AND deliver_on <= CURRENT_DATE
    ORDER BY deliver_on ASC, id ASC
    LIMIT ${MAX_PER_RUN}
  `;

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await sendOne(row, apiKey);
      await sql`UPDATE letters SET sent_at = NOW() WHERE id = ${row.id}`;
      sent++;
    } catch (err) {
      failed++;
      const msg = String(err?.message || err).slice(0, 500);
      await sql`
        UPDATE letters
        SET attempts = attempts + 1, last_error = ${msg}
        WHERE id = ${row.id}
      `;
      console.error(`letter ${row.id} failed:`, msg);
    }
  }

  // Privacy: purge rows 30 days after delivery, AND rows that
  // exhausted their delivery attempts and are 30+ days past their
  // intended delivery date (so undeliverable letters don't linger).
  let purged = 0;
  try {
    const del = await sql`
      DELETE FROM letters
      WHERE (sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL '30 days')
         OR (sent_at IS NULL
             AND attempts >= ${MAX_ATTEMPTS}
             AND deliver_on < CURRENT_DATE - INTERVAL '30 days')
      RETURNING id
    `;
    purged = del.length;
  } catch (err) {
    console.error("cleanup failed:", err);
  }

  return res.status(200).json({
    checked: due.length,
    sent,
    failed,
    purged,
    capped: due.length === MAX_PER_RUN
  });
}
