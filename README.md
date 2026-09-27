# Baraka Import System (Hostinger Web App version)

Import management system for Baraka Solar Manufacturing PLC: order plan, trade documents, FCY and bank permit, declarations and NBE delinquency.

This version runs entirely on **Hostinger**:

| Part | Where |
|------|-------|
| The system | Hostinger Web App (Node.js) |
| Data | MySQL database on your Hostinger plan |
| Staff sign-in | Email + password, then a 6-digit code sent by email |
| Updates | Every push to GitHub redeploys automatically |

> **Keep the GitHub repository private.** It contains company details, the vendor bank account and the stamp.

## What's in the repository

```
package.json        tells Hostinger this is a Node.js app (the file Hostinger asked for)
server.js           the server: sign-in, data, live updates, users
lib/store.js        MySQL storage (tables are created automatically)
lib/mailer.js       sends sign-in codes by email
public/index.html   the system (all 4 parts)
public/server-adapter.js   sign-in screen, Users and Password windows, live updates
.env.example        the settings Hostinger needs (copy into Environment variables)
docs/               business rules, data model, backup guide
```

## Setup (one time)

You need a Hostinger **Business** or **Cloud** plan (these include Web Apps).

### 1. Put this code in GitHub

Replace the files in your `BarakaImportSystem` repository with the contents of this package (GitHub: **Add file → Upload files**, drag everything in, **Commit changes**). The old `index.html` at the top level is no longer needed; delete it so there's only one copy, in `public/`.

### 2. Create the MySQL database

hPanel → **Databases → MySQL Databases**: create a database, a user and a password. Note the database name, user name, password, and the host shown on that page.

### 3. Create the sending email

hPanel → **Emails**: create a mailbox such as `system@barakasolar.com`. The system uses it to send sign-in codes (server `smtp.hostinger.com`, port `465`).

### 4. Deploy the Web App

1. hPanel → **Websites → Add Website → Deploy Web App (Node.js)** → **Import Git repository**, and choose `BarakaImportSystem`. The package.json warning is now gone.
2. Settings: Node.js version **20** (or 22), install command `npm install`, build command `npm run build`, start command `npm start`.
3. **Environment variables**: add every line from `.env.example` with your real values (database from step 2, email from step 3, and your administrator email and a strong password).
4. Click **Deploy**. When it finishes, connect your domain or subdomain (for example `import.barakasolar.com`) to the app.

### 5. First sign-in

Open your address. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`; a code arrives by email. After signing in:

- Click **Password** and set your own password.
- In Hostinger, delete the `ADMIN_PASSWORD` environment variable (it's only used to create the first administrator).

### 6. Add your staff

Click **Users**, and add each person with their name, email, role (Staff or Administrator) and a temporary password. Only administrators see the Users button. Removing a user signs them out immediately.

### 7. Bring your existing data

In the claude.ai version, click **Backup → Download backup file**. In the new system, click **Backup → Restore from a backup**, choose that file, and click Restore twice.

## Updating the system

Change the files in GitHub (for example a new `public/index.html`), and Hostinger redeploys automatically. Your data in MySQL is not affected.

If a new `index.html` comes from the claude.ai version, it needs this line just before the first `</head>`:

```html
<script src="server-adapter.js"></script>
```

## Security

- Passwords and sign-in codes are stored only as scrypt hashes.
- Codes expire after 10 minutes and allow 5 tries; sign-in is limited to 8 attempts per 15 minutes.
- Sessions last 12 hours, in a secure HttpOnly cookie.
- Only signed-in, active users can read or change data; only administrators can manage users.

## If something doesn't work

| Problem | Fix |
|---------|-----|
| Deploy fails | Open the build logs in Hostinger; check Node.js 20+ and that `package.json` is at the top level of the repository |
| "Could not start" in the logs | Check the DB_ variables match the MySQL page in hPanel |
| "Could not send the sign-in code" | Check SMTP_USER and SMTP_PASS (the mailbox from step 3) |
| "Email sending is not set up" | The SMTP_ variables are missing |
| Nobody can sign in, no users | ADMIN_EMAIL and ADMIN_PASSWORD were missing on first start; add them and redeploy |

`/api/health` shows whether the server is running, using MySQL, and able to send email.

## Documentation

- [docs/workflow.md](docs/workflow.md): business rules
- [docs/data-model.md](docs/data-model.md): record types and fields
- [docs/backup.md](docs/backup.md): backup and restore
- [CHANGELOG.md](CHANGELOG.md)
"# importSystem" 
