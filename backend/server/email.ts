type MailInput = { to: string; subject: string; text: string; html: string };

export async function sendEmail(input: MailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(`[email:development] To ${input.to}\n${input.text}`);
    return { delivered: false, development: true };
  }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { delivered: true, development: false };
}
