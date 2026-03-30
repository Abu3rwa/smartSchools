import { body, param, query } from "express-validator";
import {
  PRESENTATION_LAYOUT_SYSTEMS,
} from "../config/presentationLayoutSystems.js";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const LAYOUT_SYSTEM_IDS = PRESENTATION_LAYOUT_SYSTEMS.map((layoutSystem) => layoutSystem.id);

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
    .matches(HEX_COLOR_REGEX)
    .withMessage("primaryColor must be a valid hex color"),
  body("theme.secondaryColor")
    .optional()
    .isString()
    .matches(HEX_COLOR_REGEX)
    .withMessage("secondaryColor must be a valid hex color"),
  body("themeTokens").optional().isObject().withMessage("themeTokens must be an object"),
  body("themeTokens.titleColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.bodyColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.canvasColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.surfaceColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientFrom").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientTo").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientAngle").optional().isFloat({ min: 0, max: 360 }),
  body("schemaVersion")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("schemaVersion must be between 1 and 10"),
  body("layoutSystem")
    .optional()
    .isIn(LAYOUT_SYSTEM_IDS)
    .withMessage(`layoutSystem must be one of: ${LAYOUT_SYSTEM_IDS.join(", ")}`),
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
  body("theme").optional().isObject().withMessage("theme must be an object"),
  body("theme.primaryColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("theme.secondaryColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("theme.fontFamily").optional().isString().trim().isLength({ max: 120 }),
  body("theme.fontSize").optional().isIn(["small", "medium", "large"]),
  body("themeTokens").optional().isObject().withMessage("themeTokens must be an object"),
  body("themeTokens.titleColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.bodyColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.canvasColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.surfaceColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientFrom").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientTo").optional().isString().matches(HEX_COLOR_REGEX),
  body("themeTokens.gradientAngle").optional().isFloat({ min: 0, max: 360 }),
  body("schemaVersion")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("schemaVersion must be between 1 and 10"),
  body("layoutSystem")
    .optional()
    .isIn(LAYOUT_SYSTEM_IDS)
    .withMessage(`layoutSystem must be one of: ${LAYOUT_SYSTEM_IDS.join(", ")}`),
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
  body("background").optional().isObject().withMessage("background must be an object"),
  body("background.type").optional().isIn(["solid", "gradient", "image"]),
  body("background.solidColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("background.gradientFrom").optional().isString().matches(HEX_COLOR_REGEX),
  body("background.gradientTo").optional().isString().matches(HEX_COLOR_REGEX),
  body("background.gradientAngle").optional().isFloat({ min: 0, max: 360 }),
  body("background.imageUrl").optional().isString().isLength({ max: 1000 }),
  body("background.overlayColor").optional().isString().matches(HEX_COLOR_REGEX),
  body("background.overlayOpacity").optional().isFloat({ min: 0, max: 1 }),
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

const textAssist = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("slideIndex")
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  body("action")
    .isIn(["improve", "simplify", "grammar", "custom"])
    .withMessage("action must be improve, simplify, grammar, or custom"),
  body("selectedText")
    .isString()
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage("selectedText must be between 1 and 5000 characters"),
  body("customPrompt")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("customPrompt must be at most 1000 characters"),
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

const patchSlide = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("slideIndex")
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  body("version")
    .optional()
    .isInt({ min: 1 })
    .withMessage("version must be a positive integer"),
  body("operations")
    .isArray({ min: 1, max: 50 })
    .withMessage("operations must be an array with 1 to 50 operations"),
  body("operations.*.op")
    .isIn(["set", "replace", "unset", "remove", "append"])
    .withMessage("Unsupported patch operation"),
  body("operations.*.path")
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("Patch path is required"),
];

const applyLayout = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("slideIndex")
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  body("layout")
    .isIn([
      "title", "title-body", "two-column", "image-left", "image-right",
      "image-full", "quote", "bullets", "comparison", "blank",
    ])
    .withMessage("Invalid layout"),
  body("preserveContent")
    .optional()
    .isBoolean()
    .withMessage("preserveContent must be a boolean"),
];

const listComments = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  query("slideIndex")
    .optional()
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
  query("resolved")
    .optional()
    .isIn(["true", "false"])
    .withMessage("resolved must be true or false"),
];

const addComment = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  body("message")
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("message must be between 1 and 2000 characters"),
  body("slideIndex")
    .optional()
    .isInt({ min: 0, max: 25 })
    .withMessage("slideIndex must be between 0 and 25"),
];

const resolveComment = [
  param("id").isMongoId().withMessage("Invalid presentation ID"),
  param("commentId").isMongoId().withMessage("Invalid comment ID"),
  body("resolved")
    .optional()
    .isBoolean()
    .withMessage("resolved must be a boolean"),
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
  textAssist,
  reorder,
  patchSlide,
  applyLayout,
  listComments,
  addComment,
  resolveComment,
  createTemplate,
  updateTemplate,
};
