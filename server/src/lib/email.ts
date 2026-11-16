import { Resend } from 'resend';
import { config, isTest } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  /** Klartext (immer mitsenden – gut für Screenreader und einfache Mailprogramme) */
  text: string;
  html?: string;
}

/** In Tests und ohne API-Schlüssel werden Mails hier gesammelt statt versendet. */
export const sentMails: MailMessage[] = [];

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

/**
 * Betreff ist eine Kopfzeile und enthält oft Benutzertexte (Anzeigename, Gruppen-/Walk-Titel):
 * Zeilenumbrüche und andere Steuerzeichen entfernen (Header-Injection), Länge begrenzen.
 */
export function safeSubject(subject: string): string {
  return subject.replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}

export async function sendMail(input: MailMessage): Promise<void> {
  const msg = { ...input, subject: safeSubject(input.subject) };
  if (!resend) {
    sentMails.push(msg);
    if (sentMails.length > 200) sentMails.shift();
    if (!isTest) console.info(`[E-Mail an ${msg.to}] ${msg.subject}\n${msg.text}\n`);
    return;
  }
  const { error } = await resend.emails.send({
    from: config.EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? textToHtml(msg.text),
  });
  if (error) {
    console.error('Resend-Fehler', error.name);
    throw new Error('email_failed');
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Schlichtes, gut lesbares HTML: große Schrift, ein klarer Knopf für Links. */
export function textToHtml(text: string, button?: { label: string; url: string }): string {
  const paras = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const btn = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#1d5c3f;color:#fff;padding:16px 28px;border-radius:10px;font-size:20px;font-weight:bold;text-decoration:none">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="de"><body style="font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.5;color:#1a1a1a;background:#fbf8f2;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:12px"><p style="font-size:24px;font-weight:bold;color:#1d5c3f;margin:0 0 20px">Gehmeinsam</p>${paras}${btn}</div></body></html>`;
}
