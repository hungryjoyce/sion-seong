// Accepts a letter from the browser and stores it in Postgres with
// a delivery date. The daily cron (/api/cron-deliver) later reads
// the row and sends the email via Brevo on or after that date.

import { sql, ensureSchema } from "./_db.js";

const ALLOWED_STAMPS = new Set([
  "Japan", "Paris", "Hawaii", "Canada", "Morocco", "New Zealand"
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
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

  try {
    await ensureSchema();
    const deliverOn = `${deliveryYear}-01-01`;
    const writtenOn = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO letters (email, deliver_on, letter, stamp_label, written_on)
      VALUES (${email}, ${deliverOn}, ${letter.trim()}, ${stampLabel}, ${writtenOn})
    `;
    return res.status(200).json({ ok: true, deliveryYear });
  } catch (err) {
    console.error("send failed:", err);
    return res.status(500).json({ error: "Couldn't tuck the letter away. Try again in a minute." });
  }
}
