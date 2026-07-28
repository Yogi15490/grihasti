/**
 * Grihasti — transactional email.
 *
 * Provider-agnostic like payments. In development, with no API key configured,
 * mail is logged to the console rather than silently dropped — an OTP you
 * cannot see is indistinguishable from broken auth.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const FROM = process.env.EMAIL_FROM ?? "Grihasti <hello@grihasti.in>";

export async function sendMail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      // Never fail open in production: a missing key means nobody can log in,
      // and that must be loud.
      return { ok: false, error: "RESEND_API_KEY is not configured." };
    }
    console.log(
      `\n─── DEV EMAIL ──────────────────────────────\n` +
        `To:      ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n` +
        `────────────────────────────────────────────\n`,
    );
    return { ok: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Email provider returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function otpEmail(code: string, ttlMinutes: number): Omit<Mail, "to"> {
  return {
    subject: `${code} is your Grihasti code`,
    text:
      `Your Grihasti sign-in code is ${code}.\n\n` +
      `It expires in ${ttlMinutes} minutes. If you didn't ask for it, you can ignore this email.\n\n` +
      `— Grihasti`,
    html:
      `<p>Your Grihasti sign-in code is</p>` +
      `<p style="font-size:32px;letter-spacing:6px;font-weight:600;margin:16px 0">${code}</p>` +
      `<p style="color:#666">It expires in ${ttlMinutes} minutes. ` +
      `If you didn't ask for it, you can ignore this email.</p>`,
  };
}
