"use strict";
/* Storage layer: PostgreSQL/Supabase when DATABASE_URL is set, MySQL when DB_HOST is set, otherwise in-memory (local testing only). */

function mysqlStore() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 8,
    charset: "utf8mb4"
  });
  const q = (sql, args) => pool.execute(sql, args || []).then(r => r[0]);
  return {
    kind: "mysql",
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS docs (
        col VARCHAR(64) NOT NULL, id VARCHAR(200) NOT NULL, data LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL, updated_by VARCHAR(190) NULL,
        PRIMARY KEY (col, id)) CHARACTER SET utf8mb4`);
      await q(`CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(190) NOT NULL PRIMARY KEY, name VARCHAR(190) NOT NULL DEFAULT '',
        role VARCHAR(20) NOT NULL DEFAULT 'staff', pass_hash VARCHAR(255) NOT NULL,
        active TINYINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL) CHARACTER SET utf8mb4`);
      await q(`CREATE TABLE IF NOT EXISTS otps (
        email VARCHAR(190) NOT NULL PRIMARY KEY, code_hash VARCHAR(255) NOT NULL,
        expires BIGINT NOT NULL, tries INT NOT NULL DEFAULT 0) CHARACTER SET utf8mb4`);
      await q(`CREATE TABLE IF NOT EXISTS sessions (
        token CHAR(64) NOT NULL PRIMARY KEY, email VARCHAR(190) NOT NULL,
        expires BIGINT NOT NULL) CHARACTER SET utf8mb4`);
    },
    async getDoc(col, id) { const r = await q("SELECT data FROM docs WHERE col=? AND id=?", [col, id]); return r.length ? JSON.parse(r[0].data) : null; },
    async listCol(col) { const r = await q("SELECT id, data FROM docs WHERE col=?", [col]); return r.map(x => ({ id: x.id, data: JSON.parse(x.data) })); },
    async setDoc(col, id, data, by) { await q("INSERT INTO docs (col,id,data,updated_at,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)", [col, id, JSON.stringify(data), Date.now(), by || null]); },
    async delDoc(col, id) { await q("DELETE FROM docs WHERE col=? AND id=?", [col, id]); },
    async getUser(email) { const r = await q("SELECT * FROM users WHERE email=?", [email]); return r[0] || null; },
    async listUsers() { return q("SELECT email,name,role,active,created_at FROM users ORDER BY email"); },
    async countUsers() { const r = await q("SELECT COUNT(*) AS n FROM users"); return Number(r[0].n); },
    async saveUser(u) { await q("INSERT INTO users (email,name,role,pass_hash,active,created_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), pass_hash=VALUES(pass_hash), active=VALUES(active)", [u.email, u.name || "", u.role || "staff", u.pass_hash, u.active ? 1 : 0, u.created_at || Date.now()]); },
    async deleteUser(email) { await q("DELETE FROM users WHERE email=?", [email]); await q("DELETE FROM sessions WHERE email=?", [email]); },
    async saveOtp(email, hash, expires) { await q("INSERT INTO otps (email,code_hash,expires,tries) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash), expires=VALUES(expires), tries=0", [email, hash, expires]); },
    async getOtp(email) { const r = await q("SELECT * FROM otps WHERE email=?", [email]); return r[0] || null; },
    async bumpOtp(email) { await q("UPDATE otps SET tries=tries+1 WHERE email=?", [email]); },
    async delOtp(email) { await q("DELETE FROM otps WHERE email=?", [email]); },
    async createSession(token, email, expires) { await q("INSERT INTO sessions (token,email,expires) VALUES (?,?,?)", [token, email, expires]); },
    async getSession(token) { const r = await q("SELECT * FROM sessions WHERE token=?", [token]); return r[0] || null; },
    async delSession(token) { await q("DELETE FROM sessions WHERE token=?", [token]); },
    async purge() { const now = Date.now(); await q("DELETE FROM sessions WHERE expires<?", [now]); await q("DELETE FROM otps WHERE expires<?", [now]); }
  };
}

function pgStore() {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, max: 8 });
  const q = (sql, args) => pool.query(sql, args || []).then(r => r.rows);
  const num = r => r && Object.assign({}, r, r.expires != null ? { expires: Number(r.expires) } : {}, r.created_at != null ? { created_at: Number(r.created_at) } : {}, r.tries != null ? { tries: Number(r.tries) } : {}, r.active != null ? { active: Number(r.active) } : {});
  return {
    kind: "postgres",
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS docs (col VARCHAR(64) NOT NULL, id VARCHAR(200) NOT NULL, data TEXT NOT NULL, updated_at BIGINT NOT NULL, updated_by VARCHAR(190), PRIMARY KEY (col, id))`);
      await q(`CREATE TABLE IF NOT EXISTS users (email VARCHAR(190) PRIMARY KEY, name VARCHAR(190) NOT NULL DEFAULT '', role VARCHAR(20) NOT NULL DEFAULT 'staff', pass_hash VARCHAR(255) NOT NULL, active SMALLINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS otps (email VARCHAR(190) PRIMARY KEY, code_hash VARCHAR(255) NOT NULL, expires BIGINT NOT NULL, tries INT NOT NULL DEFAULT 0)`);
      await q(`CREATE TABLE IF NOT EXISTS sessions (token CHAR(64) PRIMARY KEY, email VARCHAR(190) NOT NULL, expires BIGINT NOT NULL)`);
    },
    async getDoc(col, id) { const r = await q("SELECT data FROM docs WHERE col=$1 AND id=$2", [col, id]); return r.length ? JSON.parse(r[0].data) : null; },
    async listCol(col) { const r = await q("SELECT id, data FROM docs WHERE col=$1", [col]); return r.map(x => ({ id: x.id, data: JSON.parse(x.data) })); },
    async setDoc(col, id, data, by) { await q("INSERT INTO docs (col,id,data,updated_at,updated_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (col,id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at, updated_by=EXCLUDED.updated_by", [col, id, JSON.stringify(data), Date.now(), by || null]); },
    async delDoc(col, id) { await q("DELETE FROM docs WHERE col=$1 AND id=$2", [col, id]); },
    async getUser(email) { const r = await q("SELECT * FROM users WHERE email=$1", [email]); return num(r[0]) || null; },
    async listUsers() { return (await q("SELECT email,name,role,active,created_at FROM users ORDER BY email")).map(num); },
    async countUsers() { const r = await q("SELECT COUNT(*) AS n FROM users"); return Number(r[0].n); },
    async saveUser(u) { await q("INSERT INTO users (email,name,role,pass_hash,active,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, pass_hash=EXCLUDED.pass_hash, active=EXCLUDED.active", [u.email, u.name || "", u.role || "staff", u.pass_hash, u.active ? 1 : 0, u.created_at || Date.now()]); },
    async deleteUser(email) { await q("DELETE FROM users WHERE email=$1", [email]); await q("DELETE FROM sessions WHERE email=$1", [email]); },
    async saveOtp(email, hash, expires) { await q("INSERT INTO otps (email,code_hash,expires,tries) VALUES ($1,$2,$3,0) ON CONFLICT (email) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires=EXCLUDED.expires, tries=0", [email, hash, expires]); },
    async getOtp(email) { const r = await q("SELECT * FROM otps WHERE email=$1", [email]); return num(r[0]) || null; },
    async bumpOtp(email) { await q("UPDATE otps SET tries=tries+1 WHERE email=$1", [email]); },
    async delOtp(email) { await q("DELETE FROM otps WHERE email=$1", [email]); },
    async createSession(token, email, expires) { await q("INSERT INTO sessions (token,email,expires) VALUES ($1,$2,$3)", [token, email, expires]); },
    async getSession(token) { const r = await q("SELECT * FROM sessions WHERE token=$1", [token]); return num(r[0]) || null; },
    async delSession(token) { await q("DELETE FROM sessions WHERE token=$1", [token]); },
    async purge() { const now = Date.now(); await q("DELETE FROM sessions WHERE expires<$1", [now]); await q("DELETE FROM otps WHERE expires<$1", [now]); }
  };
}

function memoryStore() {
  const docs = new Map(), users = new Map(), otps = new Map(), sessions = new Map();
  const k = (c, i) => c + "\u0000" + i;
  const clone = o => JSON.parse(JSON.stringify(o));
  return {
    kind: "memory",
    async init() {},
    async getDoc(col, id) { const v = docs.get(k(col, id)); return v ? clone(v) : null; },
    async listCol(col) { const out = []; for (const [key, v] of docs) { const [c, i] = key.split("\u0000"); if (c === col) out.push({ id: i, data: clone(v) }); } return out; },
    async setDoc(col, id, data) { docs.set(k(col, id), clone(data)); },
    async delDoc(col, id) { docs.delete(k(col, id)); },
    async getUser(email) { return users.get(email) || null; },
    async listUsers() { return [...users.values()].map(u => ({ email: u.email, name: u.name, role: u.role, active: u.active, created_at: u.created_at })); },
    async countUsers() { return users.size; },
    async saveUser(u) { users.set(u.email, Object.assign({ created_at: Date.now() }, users.get(u.email) || {}, u)); },
    async deleteUser(email) { users.delete(email); for (const [t, s] of sessions) if (s.email === email) sessions.delete(t); },
    async saveOtp(email, hash, expires) { otps.set(email, { email, code_hash: hash, expires, tries: 0 }); },
    async getOtp(email) { return otps.get(email) || null; },
    async bumpOtp(email) { const o = otps.get(email); if (o) o.tries++; },
    async delOtp(email) { otps.delete(email); },
    async createSession(token, email, expires) { sessions.set(token, { token, email, expires }); },
    async getSession(token) { return sessions.get(token) || null; },
    async delSession(token) { sessions.delete(token); },
    async purge() { const now = Date.now(); for (const [t, s] of sessions) if (s.expires < now) sessions.delete(t); for (const [e, o] of otps) if (o.expires < now) otps.delete(e); }
  };
}

exports.create = () => {
  const url = String(process.env.DATABASE_URL || "");
  if (/^postgres(ql)?:\/\//.test(url)) return pgStore();
  if (process.env.DB_HOST) return mysqlStore();
  if (process.env.NODE_ENV === "production") console.warn("WARNING: no database configured. Data is kept in memory and will be LOST on restart. Set DATABASE_URL (Supabase) or DB_HOST (MySQL).");
  return memoryStore();
};
