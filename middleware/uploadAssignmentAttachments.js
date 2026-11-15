import multer from "multer";
import path from "path";
import { assertUploadsEnabled } from "../services/firebaseStorageService.js";

const storage = multer.memoryStorage();

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const fileFilter = (_req, file, cb) => {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (ALLOWED_MIMES.has(mime) && ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Allowed: pdf, docx, pptx, xlsx, jpg, jpeg, png, webp, gif.",
      ),
      false,
    );
  }
};

const attachmentsMulter = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter,
});

// Multer failures are the teacher's file, not a server fault: without this
// they surface as a 500 "Internal server error" and hide the real reason.
export const mapAttachmentsUploadError = (error) => {
  if (!error) return error;
  if (error.code === "LIMIT_FILE_SIZE") {
    error.statusCode = 400;
    error.message = "Files must be 10 MB or smaller.";
  } else if (error.code === "LIMIT_FILE_COUNT") {
    error.statusCode = 400;
    error.message = `Upload up to ${MAX_FILES} files at a time.`;
  } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
    error.statusCode = 400;
    error.message = "Unexpected file field. Use the attachments picker in the form.";
  } else if (!error.statusCode) {
    error.statusCode = 400;
  }
  return error;
};

export const uploadAssignmentAttachments = {
  array: (field, maxCount) => (req, res, next) => {
    attachmentsMulter.array(field, maxCount)(req, res, (error) =>
      next(mapAttachmentsUploadError(error)),
    );
  },
};

export const requireAssignmentUploadAvailability = (req, res, next) => {
  if (!Array.isArray(req.files) || req.files.length === 0) return next();
  try {
    assertUploadsEnabled();
    return next();
  } catch (error) {
    return next(error);
  }
};
