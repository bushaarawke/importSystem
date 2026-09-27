"use strict";
/* Sends sign-in codes. Uses SMTP when SMTP_HOST is set; otherwise prints the code to the server log (local testing only). */
exports.create = () => {
  if (!process.env.SMTP_HOST) {
    return {
      configured: false,
      async sendCode(to, code) { console.log(`[sign-in code] ${to}: ${code}`); }
    };
  }
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  return {
    configured: true,
    async sendCode(to, code) {
      await transport.sendMail({
        from, to,
        subject: `Your sign-in code: ${code}`,
        text: `Your Baraka Import System sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not try to sign in, ignore this email and tell your administrator.`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16202E"><p>Your Baraka Import System sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p><p style="color:#5B6676">It expires in 10 minutes. If you did not try to sign in, ignore this email and tell your administrator.</p></div>`
      });
    }
  };
};
