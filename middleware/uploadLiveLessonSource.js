import multer from "multer";
import {
  BUILDER_DOCUMENT_MIME_TYPES,
  BUILDER_EXTENSION_TYPES,
  resolveBuilderDocumentMime,
} from "../services/documentTextExtraction.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";

/**
 * Up to eight source files for one builder request. Memory storage on purpose:
 * each buffer is parsed inside the request and never written to disk. The file
 * count and byte cap are the builder's own, stricter in count than multer's
 * defaults but the same 10 MB per file as the rest of the app.
 */

const allowed = (file) => {
  const resolved = resolveBuilderDocumentMime(file.mimetype, file.originalname);
  if (BUILDER_DOCUMENT_MIME_TYPES.has(resolved)) return true;
  const extension = String(file.originalname || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return Boolean(extension && BUILDER_EXTENSION_TYPES[extension]);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIVE_LESSON_BUILDER.maxFileBytes,
    files: LIVE_LESSON_BUILDER.maxFiles,
  },
  fileFilter: (req, file, cb) => {
    void req;
    if (allowed(file)) {
      cb(null, true);
      return;
    }
    const error = new Error("Upload a PDF, Word, PowerPoint, TXT, or a JPG, PNG or WebP photo.");
    error.code = "DOCUMENT_TYPE_UNSUPPORTED";
    error.statusCode = 400;
    cb(error, false);
  },
}).array("materialFile", LIVE_LESSON_BUILDER.maxFiles);

export const uploadLiveLessonSource = (req, res, next) => {
  upload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      error.message = "A file is too large. Upload files under 10 MB each.";
      error.code = "DOCUMENT_TOO_LARGE";
    }
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      error.message = `Upload at most ${LIVE_LESSON_BUILDER.maxFiles} files at a time.`;
      error.code = "DOCUMENT_TOO_MANY_FILES";
    }
    error.statusCode = error.statusCode || 400;
    next(error);
  });
};

export default uploadLiveLessonSource;
