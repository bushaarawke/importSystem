"use strict";
/* Baraka Import System server: serves the app, stores data in MySQL, signs staff in with password + emailed code. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const PUBLIC = path.join(__dirname, "public");
const COLS = new Set(["orders", "products", "shipments", "fcy", "permits", "declarations", "settings", "vendors"]);
const ID_RE = /^[A-Za-z0-9._:@+~-]{1,200}$/;
const SESSION_MS = 12 * 60 * 60 * 1000;
const OTP_MS = 10 * 60 * 1000;
const MAX_BODY = 8 * 1024 * 1024;

const store = require("./lib/store").create();
const mailer = require("./lib/mailer").create();

/* ---------- helpers ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function send(res, status, obj, headers) {
  const body = obj === undefined ? "" : JSON.stringify(obj);
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(Object.assign(new Error("bad json"), { status: 400 })); } });
    req.on("error", reject);
  });
}
function cookies(req) { const out = {}; (req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return out; }
function sessionCookie(token, maxAgeSec) { return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${PROD ? "; Secure" : ""}`; }
function ip(req) { return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(); }
function normEmail(e) { return String(e || "").trim().toLowerCase(); }
function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(secret), salt, 32);
  return "scrypt$" + salt.toString("hex") + "$" + key.toString("hex");
}
function checkSecret(secret, stored) {
  try {
    const [, saltHex, keyHex] = String(stored).split("$");
    const key = crypto.scryptSync(String(secret), Buffer.from(saltHex, "hex"), 32);
    return crypto.timingSafeEqual(key, Buffer.from(keyHex, "hex"));
  } catch (e) { return false; }
}
const attempts = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), a = (attempts.get(key) || []).filter(t => now - t < windowMs);
  a.push(now); attempts.set(key, a); return a.length > max;
}

/* ---------- live updates (Server-Sent Events) ---------- */
const listeners = new Set();
function broadcast(col, id) { const msg = `data: ${JSON.stringify({ col, id })}\n\n`; for (const res of listeners) { try { res.write(msg); } catch (e) {} } }
setInterval(() => { for (const res of listeners) { try { res.write(": ping\n\n"); } catch (e) {} } }, 25000);

/* ---------- auth ---------- */
async function currentUser(req) {
  const t = cookies(req).sid; if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const s = await store.getSession(t); if (!s || s.expires < Date.now()) return null;
  const u = await store.getUser(s.email); if (!u || !u.active) return null;
  return { email: u.email, name: u.name, role: u.role, token: t };
}
async function bootstrapAdmin() {
  const email = normEmail(process.env.ADMIN_EMAIL), pass = String(process.env.ADMIN_PASSWORD || "").trim().replace(/^["']|["']$/g, "");
  const reset = process.env.ADMIN_RESET === "1";
  const count = await store.countUsers();
  if (count > 0 && !reset) { console.log(`${count} user(s) found. To set the administrator's email and password again, add ADMIN_RESET=1 and redeploy.`); return; }
  if (!email || !pass) { console.warn("No administrator set. Add ADMIN_EMAIL and ADMIN_PASSWORD (and ADMIN_RESET=1 if users already exist), then redeploy."); return; }
  if (pass.length < 8) { console.warn("ADMIN_PASSWORD must have at least 8 characters. Administrator not set."); return; }
  const existing = await store.getUser(email);
  await store.saveUser({ email, name: process.env.ADMIN_NAME || (existing && existing.name) || "Administrator", role: "admin", pass_hash: hashSecret(pass), active: true, created_at: existing ? existing.created_at : Date.now() });
  console.log(`${reset ? "Administrator reset" : "First administrator created"}: ${email}. ${reset ? "Remove ADMIN_RESET and ADMIN_PASSWORD now, then redeploy." : "Remove ADMIN_PASSWORD after signing in."}`);
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  // Writes must come from the app itself (blocks cross-site form posts).
  if (m !== "GET" && req.headers["x-baraka"] !== "1") return send(res, 403, { error: "forbidden" });

  if (p === "/api/health") return send(res, 200, { ok: true, store: store.kind, email: mailer.configured });

  if (p === "/api/login" && m === "POST") {
    const b = await readBody(req), email = normEmail(b.email);
    if (limited("login:" + email, 8, 15 * 60 * 1000) || limited("ip:" + ip(req), 30, 15 * 60 * 1000)) return send(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    const u = await store.getUser(email);
    if (!u || !u.active || !checkSecret(b.password || "", u.pass_hash)) return send(res, 401, { error: "Email or password is not correct." });
    if (PROD && !mailer.configured) return send(res, 500, { error: "Email sending is not set up on the server. Ask the administrator." });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await store.saveOtp(email, hashSecret(code), Date.now() + OTP_MS);
    try { await mailer.sendCode(email, code); } catch (e) { console.error("Email failed:", e.message); return send(res, 500, { error: "Could not send the sign-in code by email. Try again, or ask the administrator." }); }
    return send(res, 200, { otp: true });
  }

  if (p === "/api/verify" && m === "POST") {
    const b = await readBody(req), email = normEmail(b.email), code = String(b.code || "").trim();
    if (limited("verify:" + email, 10, 15 * 60 * 1000)) return send(res, 429, { error: "Too many attempts. Sign in again in 15 minutes." });
    const o = await store.getOtp(email);
    if (!o || o.expires < Date.now()) return send(res, 401, { error: "The code has expired. Sign in again to get a new code." });
    if (o.tries >= 5) { await store.delOtp(email); return send(res, 401, { error: "Too many wrong codes. Sign in again to get a new code." }); }
    if (!/^\d{6}$/.test(code) || !checkSecret(code, o.code_hash)) { await store.bumpOtp(email); return send(res, 401, { error: "The code is not correct." }); }
    await store.delOtp(email);
    const u = await store.getUser(email); if (!u || !u.active) return send(res, 401, { error: "This account is not active." });
    const token = crypto.randomBytes(32).toString("hex");
    await store.createSession(token, email, Date.now() + SESSION_MS);
    return send(res, 200, { email: u.email, name: u.name, role: u.role }, { "Set-Cookie": sessionCookie(token, SESSION_MS / 1000) });
  }

  if (p === "/api/logout" && m === "POST") {
    const t = cookies(req).sid; if (t) await store.delSession(t);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }

  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: "Not signed in" });

  if (p === "/api/me") return send(res, 200, { email: user.email, name: user.name, role: user.role });

  if (p === "/api/password" && m === "POST") {
    const b = await readBody(req), u = await store.getUser(user.email);
    if (!checkSecret(b.current || "", u.pass_hash)) return send(res, 400, { error: "Your current password is not correct." });
    if (String(b.next || "").length < 8) return send(res, 400, { error: "Use a new password of at least 8 characters." });
    await store.saveUser(Object.assign({}, u, { pass_hash: hashSecret(b.next), active: !!u.active }));
    return send(res, 200, { ok: true });
  }

  if (p === "/api/events" && m === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": connected\n\n"); listeners.add(res);
    req.on("close", () => listeners.delete(res));
    return;
  }

  // Users (administrators only)
  if (p === "/api/users" || p.startsWith("/api/users/")) {
    if (user.role !== "admin") return send(res, 403, { error: "Only administrators can manage users." });
    if (p === "/api/users" && m === "GET") return send(res, 200, await store.listUsers());
    if (p === "/api/users" && m === "POST") {
      const b = await readBody(req), email = normEmail(b.email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "Enter a valid email." });
      const existing = await store.getUser(email);
      if (!existing && String(b.password || "").length < 8) return send(res, 400, { error: "Give a temporary password of at least 8 characters." });
      if (b.password && String(b.password).length < 8) return send(res, 400, { error: "Passwords need at least 8 characters." });
      const role = b.role === "admin" ? "admin" : "staff";
      if (existing && existing.email === user.email && role !== "admin") return send(res, 400, { error: "You cannot remove your own administrator role." });
      await store.saveUser({ email, name: String(b.name || (existing && existing.name) || "").slice(0, 190), role, pass_hash: b.password ? hashSecret(b.password) : existing.pass_hash, active: b.active === false ? false : true, created_at: existing ? existing.created_at : Date.now() });
      return send(res, 200, { ok: true });
    }
    const target = normEmail(decodeURIComponent(p.slice("/api/users/".length)));
    if (m === "DELETE") {
      if (target === user.email) return send(res, 400, { error: "You cannot remove your own account." });
      await store.deleteUser(target); return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "method" });
  }

  // Data
  let mm;
  if ((mm = /^\/api\/col\/([a-z]+)$/.exec(p))) {
    const col = mm[1]; if (!COLS.has(col)) return send(res, 404, { error: "unknown collection" });
    if (m === "GET") return send(res, 200, await store.listCol(col));
    if (m === "POST") {
      const b = await readBody(req); if (!b || typeof b !== "object" || Array.isArray(b)) return send(res, 400, { error: "bad document" });
      const id = crypto.randomBytes(10).toString("hex");
      await store.setDoc(col, id, b, user.email); broadcast(col, id); return send(res, 200, { id });
    }
    return send(res, 405, { error: "method" });
  }
  if ((mm = /^\/api\/doc\/([a-z]+)\/(.+)$/.exec(p))) {
    const col = mm[1], id = decodeURIComponent(mm[2]);
    if (!COLS.has(col) || !ID_RE.test(id)) return send(res, 404, { error: "unknown document" });
    if (m === "GET") { const d = await store.getDoc(col, id); return send(res, 200, { exists: !!d, data: d }); }
    if (m === "PUT" || m === "PATCH") {
      const b = await readBody(req); if (!b || typeof b !== "object" || Array.isArray(b)) return send(res, 400, { error: "bad document" });
      const data = m === "PATCH" ? Object.assign((await store.getDoc(col, id)) || {}, b) : b;
      await store.setDoc(col, id, data, user.email); broadcast(col, id); return send(res, 200, { ok: true });
    }
    if (m === "DELETE") { await store.delDoc(col, id); broadcast(col, id); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: "method" });
  }
  return send(res, 404, { error: "not found" });
}

/* ---------- static files ---------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
    res.end(buf);
  });
}

/* ---------- start ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status === 413 ? "The record is too large." : "Server error. Try again." });
  }
});

(async () => {
  try {
    await store.init();
    await bootstrapAdmin();
    setInterval(() => store.purge().catch(() => {}), 60 * 60 * 1000);
    server.listen(PORT, () => console.log(`Baraka Import System running on port ${PORT} (storage: ${store.kind}, email: ${mailer.configured ? "on" : "log only"})`));
  } catch (e) {
    console.error("Could not start:", e.message);
    process.exit(1);
  }
})();
