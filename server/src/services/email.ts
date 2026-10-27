import { config } from '../config.ts';

export const emailConfigured = () => Boolean(config.email.resendApiKey);

/** Sends the sign-in code. Without an email provider (development) the code is printed instead. */
export async function sendSignInCode(email: string, code: string, fetchImpl: typeof fetch = fetch) {
  if (!emailConfigured()) {
    console.log(`[auth] sign-in code for ${email}: ${code}`);
    return;
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.email.from,
      to: [email],
      subject: `${code} is your WhatsTheirPay code`,
      text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request it, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0c1310">
        <p>Your WhatsTheirPay sign-in code:</p>
        <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
        <p style="color:#5b6660">It expires in 10 minutes. If you didn't request it, ignore this email.</p></div>`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}
