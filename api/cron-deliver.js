// Daily cron, configured in vercel.json to run at 09:00 UTC.
// Finds letters whose delivery date has arrived and sends them via
// Brevo's transactional email API (no `scheduledAt` — immediate send).
//
// Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
// so we reject requests that don't carry that header.

import { sql, ensureSchema } from "./_db.js";

const FROM_EMAIL = "no.reply.lettersforyou@gmail.com";
const FROM_NAME = "A Letter To Your Future Self";

const STAMP_EMOJI = {
  "Japan": "🌸", "Paris": "🗼", "Hawaii": "🌊",
  "Canada": "🍁", "Morocco": "🌙", "New Zealand": "🌿"
};

// Brevo free tier caps at 300/day. Leave headroom.
const MAX_PER_RUN = 250;
const MAX_ATTEMPTS = 5;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWrittenDate(isoDate) {
  // isoDate is a YYYY-MM-DD string (or Date) from Postgres.
  const d = isoDate instanceof Date ? isoDate : new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });
}

function buildEmailHtml({ letter, writtenDate, deliveryYear, stampLabel }) {
  const safeLetter = escapeHtml(letter).replace(/\n/g, "<br>");
  const emoji = STAMP_EMOJI[stampLabel] || "✉️";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#e9d9b3;font-family:Georgia,'Cormorant Garamond',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e9d9b3;padding:32px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fdf6e3;border-radius:4px;box-shadow:0 18px 40px rgba(60,40,20,0.25);">
        <tr><td style="padding:44px 40px 36px;color:#3a2a1a;">
          <div style="text-align:right;font-size:28px;margin-bottom:8px;">${emoji}</div>
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a5a3a;margin-bottom:6px;">
            Delivered · January 1, ${deliveryYear}
          </div>
          <h1 style="font-family:Georgia,serif;font-style:italic;font-weight:normal;font-size:26px;margin:0 0 18px;color:#3a2a1a;">
            A letter you wrote to yourself.
          </h1>
          <div style="font-family:Georgia,serif;font-size:17px;line-height:1.7;color:#3a2a1a;">
            ${safeLetter}
          </div>
          <hr style="border:none;border-top:1px dashed #8a6a4a;margin:28px 0;">
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1.5px;color:#7a5a3a;text-align:center;text-transform:uppercase;">
            Written ${writtenDate}. Meant for today.
          </div>
        </td></tr>
      </table>
      <div style="font-family:'Courier New',monospace;font-size:10px;color:#7a5a3a;margin-top:16px;letter-spacing:1.5px;">
        A Letter To Your Future Self
      </div>
    </td></tr>
  </table>
</body></html>`;
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

  // Privacy: purge rows that were delivered more than 30 days ago.
  let purged = 0;
  try {
    const del = await sql`
      DELETE FROM letters
      WHERE sent_at IS NOT NULL
        AND sent_at < NOW() - INTERVAL '30 days'
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
