type MailInput = { to: string; subject: string; text: string; html: string };

export function brandedEmail(input: { eyebrow: string; title: string; body: string; actionLabel: string; actionUrl: string; expires: string }) {
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#faf8f7;color:#292524;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="max-width:560px;margin:32px auto;padding:0 20px"><div style="background:#db7b8a;padding:18px 24px;border-radius:10px 10px 0 0;color:#fff;font-size:20px;font-weight:700">ContextFlow</div><div style="background:#fff;border:1px solid #eadfe0;border-top:0;padding:32px 28px;border-radius:0 0 10px 10px"><p style="margin:0 0 10px;color:#c96b7b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${input.eyebrow}</p><h1 style="margin:0 0 18px;font-size:25px;line-height:1.3">${input.title}</h1><p style="margin:0 0 24px;color:#68615f;font-size:15px;line-height:1.8">${input.body}</p><a href="${input.actionUrl}" style="display:inline-block;background:#d97988;color:#fff;text-decoration:none;padding:13px 22px;border-radius:7px;font-weight:700">${input.actionLabel} →</a><p style="margin:24px 0 0;color:#8a8380;font-size:12px;line-height:1.7">${input.expires}</p></div><p style="padding:0 8px;color:#9a9290;font-size:12px;text-align:center">ContextFlow · Collaborative project thinking</p></div></body></html>`;
}

export async function sendEmail(input: MailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email service is not configured');
    console.info(`[email:development] To ${input.to}\n${input.text}`);
    return { delivered: false, development: true };
  }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { delivered: true, development: false };
}
