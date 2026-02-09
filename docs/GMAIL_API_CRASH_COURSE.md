# Gmail API – How This App Sends Email (Crash Course)

## 1. Big picture

```
Teacher clicks "Connect Gmail" in Settings
    → Google OAuth (login with Google, grant "Send email" permission)
    → App gets tokens and stores them on the User document
    → When we need to send email (e.g. attendance reminder), we use those tokens
    → We call Google’s Gmail API: "Send this message from this user’s Gmail"
```

**Important:** Emails are sent **from the teacher’s Gmail account** (the one they connected), not from a generic app inbox. So the teacher must connect Gmail once; after that the app can send on their behalf.

---

## 2. What you need (env + Google Cloud)

In `.env`:

- `GOOGLE_CLIENT_ID` – from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` – from Google Cloud Console
- `GOOGLE_REDIRECT_URI` – where Google sends the user after they approve (e.g. `http://localhost:5000/api/auth/gmail/callback`)

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project (or use existing).
2. **APIs & Services → Enable API** → enable **Gmail API**.
3. **APIs & Services → Credentials** → Create **OAuth 2.0 Client ID** (type: Web application).
4. **Authorized redirect URIs** must include exactly:  
   `http://localhost:5000/api/auth/gmail/callback` (dev) and/or  
   `https://your-app.herokuapp.com/api/auth/gmail/callback` (prod).

---

## 3. Step-by-step: how sending works in code

### Step A – Who triggers the send?

Anything that wants to send email goes through **notificationService**. Example: attendance reminder.

**File:** `server/controllers/attendanceTakingReminderController.js`

```js
await notificationService.sendEmail(notification, schedule.teacher._id.toString());
```

So we pass: the **Notification** (subject, body, recipient) and the **teacher’s user id** (so we send “as” that teacher’s Gmail).

---

### Step B – notificationService: try Gmail first, then SMTP

**File:** `server/services/notificationService.js` → `sendEmail(notification, userId)`

```js
// 1. If we have a userId, try Gmail OAuth first
if (userId) {
  const hasGmail = await gmailOAuthService.hasValidTokens(userId);
  if (hasGmail) {
    const result = await gmailOAuthService.sendEmail(userId, mailOptions);
    await notification.markAsSent('email');
    return;  // done
  }
}
// 2. Otherwise fall back to SMTP (if configured)
```

- `hasValidTokens(userId)` checks if that user has connected Gmail (has stored tokens).
- If yes → **Gmail API** is used via `gmailOAuthService.sendEmail(userId, mailOptions)`.
- If no (or Gmail fails) → fallback to SMTP.

So “using Gmail API” = **we call `gmailOAuthService.sendEmail(userId, mailOptions)`**.

---

### Step C – Where are the tokens?

**File:** `server/models/User.js`

Each user can have a `gmailTokens` object (stored in MongoDB):

- `email` – Gmail address they connected
- `accessToken` – short-lived, used for each API call
- `refreshToken` – long-lived, used to get new access tokens
- `expiryDate` – when the access token expires
- `isActive` – whether we consider Gmail “connected”

They get these when they complete **Connect Gmail** in your app:

1. Frontend opens `GET /api/auth/gmail/url` → backend returns a Google OAuth URL.
2. User goes to Google, signs in, grants “Send email”.
3. Google redirects to your `GOOGLE_REDIRECT_URI` with a `code`.
4. Backend: `GET /api/auth/gmail/callback` receives the code → **gmailOAuthService.exchangeCodeForTokens(code)** → **gmailOAuthService.storeTokens(userId, tokens)** → **user.updateGmailTokens(tokens, email)**.

After that, `user.hasGmailConnected()` is true and we can call `gmailOAuthService.sendEmail(userId, mailOptions)`.

---

### Step D – gmailOAuthService.sendEmail (the actual Gmail path)

**File:** `server/services/gmailOAuthService.js` → `sendEmail(userId, mailOptions)`

1. **Refresh token if needed**  
   Access tokens expire (~1 hour). We use the refresh token to get a new one so we don’t ask the user to reconnect every time.

   ```js
   const user = await this.refreshTokenIfNeeded(userId, false);
   ```

2. **Load tokens and create an OAuth2 client**  
   We build a Google OAuth2 client and set the user’s access + refresh token so the client acts “as” that user.

   ```js
   oauth2Client.setCredentials({
     access_token: user.gmailTokens.accessToken,
     refresh_token: user.gmailTokens.refreshToken
   });
   ```

3. **Call the Gmail API**  
   We pass that client and the email details to a helper that talks to Gmail.

   ```js
   const result = await this.sendViaGmailApi(oauth2Client, from, to, mailOptions);
   ```

So **“using Gmail API”** in this app = **refresh token if needed → set credentials on OAuth2 client → send via Gmail API**.

---

### Step E – The actual Gmail API call (raw message)

**File:** `server/services/gmailOAuthService.js` → `sendViaGmailApi(oauth2Client, from, to, mailOptions)`

Gmail API expects a **raw** message: RFC 2822 style, then **base64url** encoded.

1. **Build the message string** (headers + body):

   ```js
   const emailLines = [
     `From: ${from}`,
     `To: ${to}`,
     `Subject: ${subject}`,
     'Content-Type: text/html; charset=utf-8',
     '',
     html
   ];
   const email = emailLines.join('\r\n');
   ```

2. **Encode for Gmail** (base64url, no padding):

   ```js
   const encodedEmail = Buffer.from(email)
     .toString('base64')
     .replace(/\+/g, '-')
     .replace(/\//g, '_')
     .replace(/=+$/, '');
   ```

3. **Call Gmail API** (googleapis library):

   ```js
   const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

   return gmail.users.messages.send({
     userId: 'me',           // "me" = the user whose tokens we used
     requestBody: {
       raw: encodedEmail
     }
   });
   ```

So the **only** place we “use Gmail API to send the email” is this `gmail.users.messages.send` call. Everything before it is: get tokens → refresh if needed → build and encode the message.

---

## 4. Flow summary (for one attendance reminder email)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | `attendanceTakingReminderController.js` | Creates `Notification`, then calls `notificationService.sendEmail(notification, teacherId)` |
| 2 | `notificationService.js` → `sendEmail()` | If `gmailOAuthService.hasValidTokens(teacherId)` → call `gmailOAuthService.sendEmail(teacherId, mailOptions)` |
| 3 | `gmailOAuthService.js` → `sendEmail()` | Load user, refresh token if needed, set OAuth2 credentials from `user.gmailTokens`, then `sendViaGmailApi(...)` |
| 4 | `gmailOAuthService.js` → `sendViaGmailApi()` | Build RFC 2822 message, base64url encode it, call `gmail.users.messages.send({ userId: 'me', requestBody: { raw } })` |

So yes: **we are using the Gmail API to send the email**; the “send” is the `gmail.users.messages.send` call in `sendViaGmailApi`, using the teacher’s stored OAuth tokens.

---

## 5. Quick checklist for “reminder email sent via Gmail”

- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set (and correct redirect URI in Google Console).
- [ ] Teacher has clicked **Connect Gmail** in your app and completed the OAuth flow (so `user.gmailTokens` is set and `hasGmailConnected()` is true).
- [ ] Reminder job calls `notificationService.sendEmail(notification, teacher._id)` (it already does).

If any of these is missing, the app will either skip sending or fall back to SMTP; with no SMTP you see “no Gmail OAuth available / transporter not configured”.
