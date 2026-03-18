# How to Deploy Backend API to Render

This deployment is backend-only. The Express app serves API routes, while the frontend is deployed separately (for example, Firebase Hosting).

## Prerequisites
1. A GitHub repo connected to Render.
2. A MongoDB connection string.
3. Required production environment variables available.

## Deployment Steps

1. **Use the `server` repository root**
   ```bash
   cd a:\business\gb\server
   ```

2. **Push latest code to GitHub**
   ```bash
   git add .
   git commit -m "Prepare Render deployment"
   git push origin main
   ```

3. **Create Render Web Service**
   In Render dashboard:
   - New + -> Web Service
   - Connect the GitHub repository
   - Branch: `main`
   - Root Directory: leave empty (repo root is `server`)
   - Runtime: `Node`

4. **Configure Build and Start commands**
   - Build Command: `npm install && npm run render-build`
   - Start Command: `npm start`

5. **Set Environment Variables**
   Add values in Render -> Environment:
   - `NODE_ENV=production`
   - `MONGODB_URI=...`
   - `JWT_SECRET=...`
   - `CLIENT_URL=https://your-frontend-domain.web.app`
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `GOOGLE_REDIRECT_URI=https://your-render-domain.onrender.com/api/auth/gmail/callback`
   - `GOOGLE_LOGIN_REDIRECT_URI=https://your-render-domain.onrender.com/api/auth/google/callback`
   - Plus any additional keys from `.env.example`

6. **Update Google OAuth Authorized Redirect URIs**
   In Google Cloud Console -> Credentials -> OAuth 2.0 Client, add:
   - `https://your-render-domain.onrender.com/api/auth/gmail/callback`
   - `https://your-render-domain.onrender.com/api/auth/google/callback`

7. **Deploy and monitor**
   - Trigger first deploy from Render dashboard
   - Check logs in Render -> your service -> Logs

## How It Works
- `render-build` is a backend no-op validation step.
- `server.js` only serves API endpoints and health checks.
