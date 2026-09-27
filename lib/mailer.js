"use strict";
/* Sends sign-in codes, invitations and password-reset links.
   Uses SMTP when SMTP_HOST is set; otherwise prints to the server log (local testing only). */
function linkHtml(heading, body, link, button) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16202E;max-width:520px">
<p style="font-size:18px;font-weight:bold;margin:0 0 10px">${heading}</p>
<p style="line-height:1.5;margin:0 0 18px">${body}</p>
<p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#1E5F83;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:bold">${button}</a></p>
<p style="color:#5B6676;font-size:13px;line-height:1.5;margin:0">If the button doesn't work, copy this address into your browser:<br><span style="word-break:break-all">${link}</span></p>
<p style="color:#5B6676;font-size:13px;margin:14px 0 0">Baraka Import System</p></div>`;
}
exports.create = () => {
  let transport = null, from = "";
  if (process.env.SMTP_HOST) {
    const nodemailer = require("nodemailer");
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    from = process.env.MAIL_FROM || process.env.SMTP_USER;
  }
  async function send(to, subject, text, html) {
    if (!transport) { console.log(`[email to ${to}] ${subject} | ${text.replace(/\n+/g, " ")}`); return; }
    await transport.sendMail({ from, to, subject, text, html });
  }
  return {
    configured: !!transport,
    async sendCode(to, code) {
      if (!transport) { console.log(`[sign-in code] ${to}: ${code}`); return; }
      await send(to, `Your sign-in code: ${code}`,
        `Your Baraka Import System sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not try to sign in, ignore this email and tell your administrator.`,
        `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16202E"><p>Your Baraka Import System sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p><p style="color:#5B6676">It expires in 10 minutes. If you did not try to sign in, ignore this email and tell your administrator.</p></div>`);
    },
    async sendInvite(to, name, link) {
      await send(to, "You're invited to the Baraka Import System",
        `Hello ${name || ""},\n\nAn account has been created for you in the Baraka Import System. Open this link to choose your password (valid for 7 days):\n${link}\n\nAfter that, sign in with your email, your password and the code we email you.`,
        linkHtml(`Hello ${name || ""}`, "An account has been created for you in the Baraka Import System. Click the button to choose your password. The link is valid for 7 days.", link, "Choose my password"));
    },
    async sendReset(to, name, link) {
      await send(to, "Reset your Baraka Import System password",
        `Hello ${name || ""},\n\nOpen this link to choose a new password (valid for 2 hours):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
        linkHtml(`Hello ${name || ""}`, "Click the button to choose a new password. The link is valid for 2 hours. If you didn't ask for this, you can ignore this email.", link, "Choose a new password"));
    }
  };
};
