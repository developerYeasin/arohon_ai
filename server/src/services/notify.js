// Outbound messages. Email uses SMTP (nodemailer); SMS uses any Bangladeshi bulk-SMS provider that
// accepts an HTTP GET — configure SMS_API_URL with {to} and {message} placeholders, e.g.
//   https://provider.example/api/send?api_key=KEY&senderid=ID&number={to}&message={message}
import nodemailer from 'nodemailer';

let transport = null;
const mailer = () => {
  if (!process.env.SMTP_HOST) return null;
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }));
};

export const emailEnabled = () => !!process.env.SMTP_HOST;
export const smsEnabled = () => !!process.env.SMS_API_URL;

export async function sendEmail(to, subject, text) {
  const m = mailer();
  if (!m) return false;
  await m.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  return true;
}

export async function sendSms(to, message) {
  if (!smsEnabled()) return false;
  const number = to.startsWith('88') ? to : `88${to}`;
  const url = process.env.SMS_API_URL.replace('{to}', encodeURIComponent(number)).replace('{message}', encodeURIComponent(message));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
  return true;
}
