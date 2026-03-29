import { body, param, query } from "express-validator";

const mongoId = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
];

const upload = [
  // Files validated by multer middleware; no additional body validation needed
];

const generate = [
  body("title")
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("title must be between 1 and 200 characters"),
  body("lessonPlanId")
    .optional()
    .isMongoId()
    .withMessage("lessonPlanId must be a valid Mongo ID"),
  body("extractionIds")
    .optional()
    .isArray({ max: 5 })
    .withMessage("extractionIds must be an array of up to 5 IDs"),
  body("extractionIds.*")
    .optional()
    .isMongoId()
    .withMessage("Each extractionId must be a valid Mongo ID"),
  body("templateId")
    .optional()
    .isMongoId()
    .withMessage("templateId must be a valid Mongo ID"),
  body("prompt")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("prompt must be at most 2000 characters"),
  body("slideCount")
    .optional()
    .isInt({ min: 3, max: 20 })
    .withMessage("slideCount must be between 3 and 20"),
  body("requestedLanguages")
    .optional()
    .isArray({ max: 3 })
    .withMessage("requestedLanguages must be an array of up to 3 language codes"),
  body("requestedLanguages.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 5 }),
  body("classId")
    .optional()
    .isMongoId()
    .withMessage("classId must be a valid Mongo ID"),
  body("subjectId")
    .optional()
    .isMongoId()
    .withMessage("subjectId must be a valid Mongo ID"),
  body("theme").optional().isObject().withMessage("theme must be an object"),
  body("theme.primaryColor")
    .optional()
    .isString()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage("primaryColor must be a valid hex color"),
  body("theme.secondaryColor")
    .optional()
    .isString()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage("secondaryColor must be a valid hex color"),
];

const list = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("limit must be between 1 and 50"),
  query("status")
    .optional()
    .isIn(["draft", "ready", "presented", "archived"])
    .withMessage("status must be draft, ready, presented, or archived"),
  query("classId")
    .optional()
    .isMongoId()
    .withMessage("classId must be a valid Mongo ID"),
  query("subjectId")
    .optional()
    .isMongoId()
    .withMessage("subjectId must be a valid Mongo ID"),
  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("search must be at most 100 characters"),
];

const updateMeta = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  body("title")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("title must be between 1 and 200 characters"),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("description must be at most 500 characters"),
  body("status")
    .optional()
    .isIn(["draft", "ready", "presented", "archived"])
    .withMessage("status must be draft, ready, presented, or archived"),
];

const updateSlide = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("slideIndex")
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  body("title")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage("title must be at most 200 characters"),
  body("subtitle")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 300 }),
  body("bodyHtml")
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage("bodyHtml must be at most 5000 characters"),
  body("bodyHtml2")
    .optional()
    .isString()
    .isLength({ max: 5000 }),
  body("speakerNotes")
    .optional()
    .isString()
    .isLength({ max: 2000 }),
  body("layout")
    .optional()
    .isIn([
      "title", "title-body", "two-column", "image-left", "image-right",
      "image-full", "quote", "bullets", "comparison", "blank",
    ])
    .withMessage("Invalid layout"),
];

const regenerateSlide = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("slideIndex")
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  body("prompt")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("prompt must be at most 2000 characters"),
  body("keepLayout")
    .optional()
    .isBoolean()
    .withMessage("keepLayout must be a boolean"),
];

const reorder = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  body("slideOrder")
    .isArray({ min: 1, max: 25 })
    .withMessage("slideOrder must be an array of indexes"),
  body("slideOrder.*")
    .isInt({ min: 0, max: 25 })
    .withMessage("Each index must be a non-negative integer"),
];

const createTemplate = [
  body("name")
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("name must be between 1 and 100 characters"),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 300 }),
  body("category")
    .optional()
    .isIn(["lesson", "review", "assessment", "meeting", "custom"])
    .withMessage("Invalid category"),
  body("slideStructure")
    .optional()
    .isArray({ max: 25 })
    .withMessage("slideStructure must be an array of up to 25 items"),
  body("slideStructure.*.layout")
    .optional()
    .isString(),
  body("slideStructure.*.purpose")
    .optional()
    .isIn(["opener", "objective", "content", "activity", "assessment", "summary", "closer", "custom"]),
  body("slideStructure.*.promptHint")
    .optional()
    .isString()
    .isLength({ max: 500 }),
];

const updateTemplate = [
  param("id").isMongoId().withMessage("Invalid template ID"),
  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 }),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 300 }),
  body("isActive").optional().isBoolean(),
];

export const presentationValidators = {
  mongoId,
  upload,
  generate,
  list,
  updateMeta,
  updateSlide,
  regenerateSlide,
  reorder,
  createTemplate,
  updateTemplate,
};
