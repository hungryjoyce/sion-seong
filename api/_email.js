// Shared email HTML template used by both the scheduled delivery
// cron and the preview endpoint. Keeps them in sync.

const STAMP_EMOJI = {
  "Japan": "🌸", "Paris": "🗼", "Hawaii": "🌊",
  "Canada": "🍁", "Morocco": "🌙", "New Zealand": "🌿"
};

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEmailHtml({ letter, writtenDate, deliveryYear, stampLabel }) {
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
