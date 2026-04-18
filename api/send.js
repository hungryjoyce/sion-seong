// Vercel serverless function.
// Holds the Brevo API key (set via Vercel env var BREVO_API_KEY) so it
// never reaches the browser. Receives letter data from the site, builds
// the parchment-styled HTML email, and schedules delivery via Brevo.

const FROM_EMAIL = "no.reply.lettersforyou@gmail.com";
const FROM_NAME = "A Letter To Your Future Self";

const ALLOWED_STAMPS = new Set([
  "Japan", "Paris", "Hawaii", "Canada", "Morocco", "New Zealand"
]);

const STAMP_EMOJI = {
  "Japan": "🌸", "Paris": "🗼", "Hawaii": "🌊",
  "Canada": "🍁", "Morocco": "🌙", "New Zealand": "🌿"
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is not configured." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { email, year, letter, stampLabel } = body;

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }
  const deliveryYear = parseInt(year, 10);
  const nowYear = new Date().getUTCFullYear();
  if (!Number.isInteger(deliveryYear) || deliveryYear < nowYear + 1 || deliveryYear > nowYear + 10) {
    return res.status(400).json({ error: "Pick a year between 1 and 10 from now." });
  }
  if (typeof letter !== "string" || !letter.trim()) {
    return res.status(400).json({ error: "Write something first." });
  }
  if (letter.length > 20000) {
    return res.status(400).json({ error: "That letter is a bit long — keep it under 20,000 characters." });
  }
  if (typeof stampLabel !== "string" || !ALLOWED_STAMPS.has(stampLabel)) {
    return res.status(400).json({ error: "Pick one of the stamps." });
  }

  const writtenDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric"
  });

  const htmlContent = buildEmailHtml({
    letter: letter.trim(),
    writtenDate,
    deliveryYear,
    stampLabel
  });

  const payload = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email }],
    subject: "A letter to you — open today 🕰️",
    htmlContent,
    scheduledAt: `${deliveryYear}-01-01T09:00:00.000+00:00`
  };

  try {
    const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!brevoResp.ok) {
      let detail = "";
      try {
        const data = await brevoResp.json();
        detail = data.message || data.code || "";
      } catch (_) { /* ignore */ }
      return res.status(502).json({
        error: "Email provider rejected the letter." + (detail ? " " + detail : "")
      });
    }

    return res.status(200).json({ ok: true, deliveryYear });
  } catch (err) {
    return res.status(502).json({ error: "Couldn't reach the email provider." });
  }
}
