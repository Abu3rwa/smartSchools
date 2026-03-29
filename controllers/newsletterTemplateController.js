import { asyncHandler } from "../middleware/errorHandler.js";
import NewsletterTemplate from "../models/NewsletterTemplate.js";
import { hasPermission, PERMISSIONS } from "../config/permissions.js";
import { uploadFile } from "../services/firebaseStorageService.js";

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */
function requireTemplatePermission(user) {
  if (
    user.role === "super_admin" ||
    user.role === "admin" ||
    hasPermission(user, PERMISSIONS.MANAGE_NEWSLETTER_TEMPLATES)
  ) {
    return;
  }
  const err = new Error("You do not have permission to manage newsletter templates");
  err.statusCode = 403;
  throw err;
}

const MAX_SECTIONS = 30;

const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function resolveImageExtension(file = {}) {
  const mime = String(file.mimetype || "").toLowerCase();
  if (MIME_EXTENSION_MAP[mime]) return MIME_EXTENSION_MAP[mime];

  const name = String(file.originalname || "");
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < name.length - 1) {
    return name.slice(dotIndex + 1).toLowerCase();
  }
  return "jpg";
}

/* ────────────────────────────────────────────────────────────────
 * List all templates for current school
 * GET /api/newsletter-templates
 * ──────────────────────────────────────────────────────────────── */
export const listTemplates = asyncHandler(async (req, res) => {
  const templates = await NewsletterTemplate.find({ school: req.schoolId })
    .sort({ isDefault: -1, updatedAt: -1 })
    .select("name description isDefault isActive thumbnail globalStyle.primaryColor globalStyle.headerStyle sections createdAt updatedAt")
    .lean();

  res.json({ success: true, data: templates });
});

/* ────────────────────────────────────────────────────────────────
 * Get single template
 * GET /api/newsletter-templates/:id
 * ──────────────────────────────────────────────────────────────── */
export const getTemplate = asyncHandler(async (req, res) => {
  const template = await NewsletterTemplate.findOne({
    _id: req.params.id,
    school: req.schoolId,
  }).lean();

  if (!template) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }

  res.json({ success: true, data: template });
});

/* ────────────────────────────────────────────────────────────────
 * Upload image for template blocks/backgrounds
 * POST /api/newsletter-templates/upload-image
 * ──────────────────────────────────────────────────────────────── */
export const uploadTemplateImage = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  if (!req.file) {
    const err = new Error("Please provide a valid image file");
    err.statusCode = 400;
    throw err;
  }

  const extension = resolveImageExtension(req.file);
  const destinationPath = `newsletters/templates/${req.schoolId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension}`;

  const imageUrl = await uploadFile(req.file.buffer, req.file.mimetype, destinationPath);

  res.status(201).json({
    success: true,
    data: {
      url: imageUrl,
      path: destinationPath,
    },
  });
});

/* ────────────────────────────────────────────────────────────────
 * Create a new template
 * POST /api/newsletter-templates
 * ──────────────────────────────────────────────────────────────── */
export const createTemplate = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  const { name, description, sections, globalStyle, isDefault } = req.body;

  if (!name || !String(name).trim()) {
    const err = new Error("Template name is required");
    err.statusCode = 400;
    throw err;
  }

  if (Array.isArray(sections) && sections.length > MAX_SECTIONS) {
    const err = new Error(`A template can have at most ${MAX_SECTIONS} sections`);
    err.statusCode = 400;
    throw err;
  }

  const template = await NewsletterTemplate.create({
    school: req.schoolId,
    name: String(name).trim(),
    description: String(description || "").trim(),
    sections: Array.isArray(sections) ? sections : [],
    globalStyle: globalStyle || {},
    isDefault: !!isDefault,
    createdBy: req.user._id,
    lastEditedBy: req.user._id,
  });

  res.status(201).json({ success: true, data: template });
});

/* ────────────────────────────────────────────────────────────────
 * Update a template
 * PUT /api/newsletter-templates/:id
 * ──────────────────────────────────────────────────────────────── */
export const updateTemplate = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  const template = await NewsletterTemplate.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });

  if (!template) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }

  const { name, description, sections, globalStyle, isDefault, isActive } = req.body;

  if (name !== undefined) template.name = String(name).trim();
  if (description !== undefined) template.description = String(description).trim();
  if (isDefault !== undefined) template.isDefault = !!isDefault;
  if (isActive !== undefined) template.isActive = !!isActive;
  if (globalStyle !== undefined) template.globalStyle = globalStyle;

  if (sections !== undefined) {
    if (Array.isArray(sections) && sections.length > MAX_SECTIONS) {
      const err = new Error(`A template can have at most ${MAX_SECTIONS} sections`);
      err.statusCode = 400;
      throw err;
    }
    template.sections = Array.isArray(sections) ? sections : template.sections;
  }

  template.lastEditedBy = req.user._id;
  await template.save();

  res.json({ success: true, data: template });
});

/* ────────────────────────────────────────────────────────────────
 * Delete template
 * DELETE /api/newsletter-templates/:id
 * ──────────────────────────────────────────────────────────────── */
export const deleteTemplate = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  const template = await NewsletterTemplate.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });

  if (!template) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }

  await template.deleteOne();
  res.json({ success: true, message: "Template deleted" });
});

/* ────────────────────────────────────────────────────────────────
 * Duplicate template
 * POST /api/newsletter-templates/:id/duplicate
 * ──────────────────────────────────────────────────────────────── */
export const duplicateTemplate = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  const source = await NewsletterTemplate.findOne({
    _id: req.params.id,
    school: req.schoolId,
  }).lean();

  if (!source) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }

  const copy = await NewsletterTemplate.create({
    school: req.schoolId,
    name: `${source.name} (Copy)`,
    description: source.description,
    sections: source.sections,
    globalStyle: source.globalStyle,
    isDefault: false,
    isActive: true,
    createdBy: req.user._id,
    lastEditedBy: req.user._id,
  });

  res.status(201).json({ success: true, data: copy });
});

/* ────────────────────────────────────────────────────────────────
 * Set a template as the school's default
 * PATCH /api/newsletter-templates/:id/set-default
 * ──────────────────────────────────────────────────────────────── */
export const setDefaultTemplate = asyncHandler(async (req, res) => {
  requireTemplatePermission(req.user);

  const template = await NewsletterTemplate.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });

  if (!template) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }

  template.isDefault = true;
  template.lastEditedBy = req.user._id;
  await template.save(); // pre-save hook un-defaults others

  res.json({ success: true, data: template });
});

/* ────────────────────────────────────────────────────────────────
 * Get the school's default (or fallback first active) template
 * GET /api/newsletter-templates/active-default
 * ──────────────────────────────────────────────────────────────── */
export const getActiveDefault = asyncHandler(async (req, res) => {
  let template = await NewsletterTemplate.findOne({
    school: req.schoolId,
    isDefault: true,
    isActive: true,
  }).lean();

  if (!template) {
    template = await NewsletterTemplate.findOne({
      school: req.schoolId,
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  res.json({ success: true, data: template || null });
});
