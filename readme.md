# GradeBook Pro

Student Grade Management System – Backend API and React frontend for schools. Supports grades, attendance, timetables, lesson plans, newsletters, reports, and parent notifications.

## Prerequisites

- **Node.js** 18+
- **MongoDB** 6+
- **npm** or **yarn**

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

### 2. Environment setup

```bash
cp .env.example .env
```

Edit `.env` and set the required variables (see [Environment variables](#environment-variables) below).

### 3. Run the server

```bash
npm run dev
```

The API runs at `http://localhost:5000`.

### 4. Run the client (development)

```bash
cd client
npm install
npm run dev
```

The React app runs at `http://localhost:5173`.

### 5. Seed data (optional)

```bash
npm run seed
```

## Environment Variables

See [.env.example](.env.example) for the full list. Required variables:

| Variable | Description |
|---------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT tokens |
| `GEMINI_API_KEY` | API key for Gemini AI features |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

Optional: `PORT`, `NODE_ENV`, `CLIENT_URL`, `JWT_EXPIRE`, `GOOGLE_REDIRECT_URI`, `GOOGLE_LOGIN_REDIRECT_URI`, `ALLOW_LOCAL_SERVICE_ACCOUNT` (local/dev only), and background job toggles (`RUN_NEWSLETTER_ISSUE_SCHEDULER`, `RUN_SUBSTITUTION_EXPIRY_JOB`, etc.).

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server (nodemon) |
| `npm run seed` | Seed database with sample data |
| `npm run test:reminder` | Run attendance reminder test script |
| `npm run test:newsletter` | Run newsletter utils test script |

## API Endpoints

- **Health:** `GET /api/health` – Liveness check
- **Readiness:** `GET /api/health/ready` – MongoDB connection check (for load balancers)
- **Auth:** `POST /api/auth/login`, `POST /api/auth/register`, etc.
- **Schools, Students, Classes, Grades, Attendance:** See API docs or route files.

## Project Structure

```
├── client/          # React (Vite) frontend
├── config/          # DB, env validation
├── controllers/     # API handlers
├── models/          # Mongoose models
├── routes/          # Express routes
├── services/        # Business logic
├── middleware/      # Auth, error handling, etc.
├── server.js        # Entry point
└── .env.example     # Environment template
```

## Documentation

- [Improvement roadmap](docs/IMPROVEMENTS.md)
- [Quick wins](docs/improvements/06-quick-wins.md)
- [UI/UX review](client/docs/UI_UX_IMPROVEMENT_REVIEW.md)
- [Tenant filter policy](docs/TENANT_FILTER_POLICY.md)

## License

ISC
