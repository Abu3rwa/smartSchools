/**
 * L7: the one-click opt-out behind every family email.
 *
 * The link carries a signed school+address token, so the public route never has
 * to trust a query string and never reveals whether an address is on file. The
 * link opens a small confirmation page; only its button records the opt-out, so
 * a mail scanner that follows links cannot unsubscribe anyone by accident.
 */
import crypto from "node:crypto";
import mongoose from "mongoose";

import School from "../models/School.js";
import WritingEmailOptOut from "../models/WritingEmailOptOut.js";
import logger from "../utils/logger.js";

const secret = () =>
  String(
    process.env.WRITING_EMAIL_OPT_OUT_SECRET || process.env.JWT_SECRET || "",
  ).trim();

const normalize = (email) => String(email || "").trim().toLowerCase();

const sign = (body) =>
  crypto.createHmac("sha256", secret()).update(body).digest("base64url");

/** The signed token for one address, or "" when the server has no secret. */
export const optOutToken = ({ schoolId, email }) => {
  if (!secret()) return "";
  const body = Buffer.from(
    `${String(schoolId)}:${normalize(email)}`,
    "utf8",
  ).toString("base64url");
  return `${body}.${sign(body)}`;
};

/** The school and address a token stands for, or null when it was not signed here. */
export const readOptOutToken = (token) => {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature || !secret()) return null;
  const expected = sign(body);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return null;
  if (!crypto.timingSafeEqual(given, wanted)) return null;

  const payload = Buffer.from(body, "base64url").toString("utf8");
  const separator = payload.indexOf(":");
  const schoolId = payload.slice(0, separator);
  const email = normalize(payload.slice(separator + 1));
  if (!mongoose.isValidObjectId(schoolId) || !email.includes("@")) return null;
  return { schoolId, email };
};

export const buildOptOutUrl = ({ baseUrl, schoolId, email }) => {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const token = optOutToken({ schoolId, email });
  if (!base || !token) return "";
  return `${base}/api/public/writing-email-opt-out/${token}`;
};

/** Records the opt-out; the same address twice is the same row. */
export const recordWritingEmailOptOut = async ({
  schoolId,
  email,
  source = "email-link",
}) => {
  try {
    await WritingEmailOptOut.updateOne(
      { school: schoolId, email: normalize(email) },
      { $setOnInsert: { optedOutAt: new Date(), source } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    // A parallel click on the same link can lose the upsert race; the row exists.
    if (error?.code === 11000) return true;
    logger.warn("writing_email_opt_out_failed", {
      schoolId: String(schoolId),
      message: error?.message,
    });
    return false;
  }
};

/** The subset of these addresses that must never receive writing feedback. */
export const optedOutEmails = async ({ schoolId, emails = [] }) => {
  const wanted = [...new Set(emails.map(normalize).filter(Boolean))];
  if (!wanted.length) return new Set();
  const rows = await WritingEmailOptOut.find({
    school: schoolId,
    email: { $in: wanted },
  })
    .select("email")
    .lean();
  return new Set(rows.map((row) => row.email));
};

const PAGE_COPY = {
  en: {
    title: "Stop writing feedback emails",
    heading: "Stop these emails?",
    body: "This stops writing feedback emails to {email}. The school may still contact you in other ways.",
    confirm: "Stop these emails",
    doneTitle: "You have been removed",
    done: "{email} will not receive writing feedback emails from {school} any more.",
    invalidTitle: "This link is not valid",
    invalid: "Open the link from the email again, or ask the school to stop the emails for you.",
    mistake: "If this was a mistake, contact the school.",
  },
  ar: {
    title: "إيقاف رسائل ملاحظات الكتابة",
    heading: "أتريد إيقاف هذه الرسائل؟",
    body: "سيؤدي هذا إلى إيقاف رسائل ملاحظات الكتابة إلى {email}. قد تتواصل معك المدرسة بطرق أخرى.",
    confirm: "أوقف هذه الرسائل",
    doneTitle: "تمت إزالتك",
    done: "لن تتلقى {email} رسائل ملاحظات الكتابة من {school} بعد الآن.",
    invalidTitle: "هذا الرابط غير صالح",
    invalid: "افتح الرابط من البريد مرة أخرى، أو اطلب من المدرسة إيقاف الرسائل عنك.",
    mistake: "إن كان هذا بالخطأ، تواصل مع المدرسة.",
  },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fill = (template, values) =>
  String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

/** Pure: the small standalone page, in the school's language, never app chrome. */
export const buildOptOutPage = ({
  language = "en",
  email = "",
  schoolName = "",
  done = false,
  invalid = false,
}) => {
  const lang = language === "ar" ? "ar" : "en";
  const copy = PAGE_COPY[lang];
  const values = { email, school: schoolName || (lang === "ar" ? "المدرسة" : "the school") };
  const body = invalid
    ? `<h1>${escapeHtml(copy.invalidTitle)}</h1>
       <p>${escapeHtml(copy.invalid)}</p>`
    : done
      ? `<h1>${escapeHtml(copy.doneTitle)}</h1>
       <p>${escapeHtml(fill(copy.done, values))}</p>
       <p class="muted">${escapeHtml(copy.mistake)}</p>`
      : `<h1>${escapeHtml(copy.heading)}</h1>
       <p>${escapeHtml(fill(copy.body, values))}</p>
       <form method="post" action="">
         <button type="submit">${escapeHtml(copy.confirm)}</button>
       </form>`;

  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(copy.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #0f172a; font-family: "Segoe UI", Tahoma, Arial, sans-serif; padding: 24px; }
  main { width: 100%; max-width: 480px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px 24px; }
  h1 { margin: 0 0 12px; font-size: 20px; line-height: 1.4; }
  p { margin: 0 0 14px; font-size: 15px; line-height: 1.7; color: #334155; }
  button { width: 100%; border: 0; border-radius: 10px; background: #0f766e; color: #ffffff; font-size: 15px; font-weight: 700; padding: 13px 20px; cursor: pointer; }
  .muted { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
  <main>
    <p class="muted">${escapeHtml(schoolName)}</p>
    ${body}
  </main>
</body>
</html>`;
};

export const optOutPageFor = async ({ token, done = false }) => {
  const claim = readOptOutToken(token);
  if (!claim) {
    return {
      statusCode: 404,
      html: buildOptOutPage({ invalid: true, email: "", schoolName: "" }),
    };
  }
  const school = await School.findOne({ _id: claim.schoolId })
    .select("name reportSettings.defaultLanguage")
    .lean();
  const language =
    String(school?.reportSettings?.defaultLanguage || "").toLowerCase() ===
    "arabic"
      ? "ar"
      : "en";
  return {
    statusCode: 200,
    html: buildOptOutPage({
      language,
      email: claim.email,
      schoolName: school?.name || "",
      done,
    }),
  };
};
