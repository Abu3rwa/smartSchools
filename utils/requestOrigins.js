import process from "node:process";

// Fallback defaults kept for backward compatibility with deployments that set no env origins.
const fallbackOrigins = ["http://localhost:5173", "https://schoolos-is02.onrender.com"];

export const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ...fallbackOrigins,
]
  .map((origin) => (typeof origin === "string" ? origin.trim() : origin))
  .filter(Boolean);

// Restrict to known Firebase project prefixes instead of a wildcard domain.
const firebaseProjectPrefix = process.env.FIREBASE_PROJECT_ID || "smile3-8c8c5";
const allowedFirebaseOrigins = [
  `https://${firebaseProjectPrefix}.web.app`,
  `https://${firebaseProjectPrefix}.firebaseapp.com`,
];

export const isAllowedRequestOrigin = (origin) => {
  // Requests without an Origin header are non-browser clients (health checks,
  // server-to-server, curl). They are never anonymous: every one of these paths
  // still authenticates a bearer token before it can read or write anything.
  if (!origin) return true;
  return allowedOrigins.includes(origin) || allowedFirebaseOrigins.includes(origin);
};
