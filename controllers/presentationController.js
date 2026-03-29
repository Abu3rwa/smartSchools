import Presentation from "../models/Presentation.js";
import PresentationTemplate from "../models/PresentationTemplate.js";
import PresentationExtraction from "../models/PresentationExtraction.js";
import LessonPlan from "../models/LessonPlan.js";
import Standard from "../models/Standard.js";
import { AITokenUsage } from "../models/AITokenUsage.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { uploadFile, deleteFile } from "../services/firebaseStorageService.js";
import { extractFromBuffer } from "../services/presentationExtractionService.js";
import {
  buildContext,
  generateSlides,
  regenerateSingleSlide,
  scanAndRedactPII,
} from "../services/presentationGenerationService.js";
import { exportPresentationPdf } from "../services/presentationExportService.js";
import { PRESENTATION_LIMITS } from "../config/presentationLimits.js";

const MODEL_NAME = "gemini-2.5-flash-lite";

const DEFAULT_GLOBAL_TEMPLATES = [
  {
    name: "Standard Lesson",
    description:
      "A complete lesson flow with objectives, core content, activity, and recap.",
    category: "lesson",
    isGlobal: true,
    isActive: true,
    slideStructure: [
      {
        layout: "title",
        purpose: "opener",
        promptHint: "Title slide with lesson topic and class context",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "objective",
        promptHint: "2-4 student-friendly learning objectives",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "content",
        promptHint: "Introduce the key concept with a simple explanation",
        required: true,
      },
      {
        layout: "two-column",
        purpose: "content",
        promptHint: "Concept vs examples in two clear columns",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "activity",
        promptHint: "Guided or collaborative classroom activity",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "assessment",
        promptHint: "Quick check-for-understanding questions",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "summary",
        promptHint: "Key takeaways tied back to objectives",
        required: true,
      },
      {
        layout: "title",
        purpose: "closer",
        promptHint: "Closing and next steps/homework",
        required: false,
      },
    ],
    defaultTheme: {
      primaryColor: "#1a73e8",
      secondaryColor: "#174ea6",
      fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
      fontSize: "medium",
    },
  },
  {
    name: "Quick Review",
    description:
      "A compact review deck for recap and exam preparation.",
    category: "review",
    isGlobal: true,
    isActive: true,
    slideStructure: [
      {
        layout: "title",
        purpose: "opener",
        promptHint: "Review topic and goals",
        required: true,
      },
      {
        layout: "bullets",
        purpose: "content",
        promptHint: "Summarize main concepts in concise bullets",
        required: true,
      },
      {
        layout: "comparison",
        purpose: "content",
        promptHint: "Common mistakes vs correct approach",
        required: true,
      },
      {
        layout: "title-body",
        purpose: "assessment",
        promptHint: "3-4 short practice or discussion questions",
        required: true,
      },
      {
        layout: "title",
        purpose: "summary",
        promptHint: "Recap and action steps for students",
        required: true,
      },
    ],
    defaultTheme: {
      primaryColor: "#0d47a1",
      secondaryColor: "#1565c0",
      fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
      fontSize: "medium",
    },
  },
];

const ensureGlobalPresentationTemplates = async () => {
  const existingGlobalCount = await PresentationTemplate.countDocuments({
    isGlobal: true,
  }).setOptions({ skipTenantFilter: true });

  if (existingGlobalCount > 0) return;

  await PresentationTemplate.insertMany(DEFAULT_GLOBAL_TEMPLATES, {
    ordered: false,
  });
};

// ─── Upload materials ───────────────────────────────────────────────────────

export const uploadMaterials = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: "No files uploaded" });
  }

  const extractions = [];

  for (const file of req.files) {
    // Upload to Firebase
    const destinationPath = `schools/${req.schoolId}/presentations/materials/${Date.now()}_${file.originalname}`;
    const fileUrl = await uploadFile(file.buffer, file.mimetype, destinationPath);

    // Extract text content
    let extractionResult = { text: "", pageCount: 0, wordCount: 0, chunks: [] };
    try {
      extractionResult = await extractFromBuffer(file.buffer, file.mimetype);
    } catch (err) {
      console.error(`Extraction failed for ${file.originalname}:`, err.message);
    }

    const extraction = await PresentationExtraction.create({
      school: req.schoolId,
      uploadedBy: req.user._id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: destinationPath,
      extractedText: extractionResult.text,
      chunks: extractionResult.chunks,
      pageCount: extractionResult.pageCount,
      wordCount: extractionResult.wordCount,
      extractionStatus: extractionResult.text ? "completed" : "failed",
    });

    extractions.push(extraction);
  }

  res.status(201).json({
    success: true,
    data: { extractions },
  });
});

// ─── Generate presentation ──────────────────────────────────────────────────

export const generatePresentation = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    lessonPlanId,
    classId,
    subjectId,
    standardIds,
    templateId,
    theme,
    slideCount = 10,
    extractionIds,
    prompt,
    requestedLanguages,
  } = req.body;

  // Daily quota check
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await Presentation.countDocuments({
    school: req.schoolId,
    teacher: req.user._id,
    createdAt: { $gte: startOfDay },
  });

  const planKey = req.school?.plan || "professional";
  const dailyLimit = PRESENTATION_LIMITS.dailyGenerations[planKey] || PRESENTATION_LIMITS.dailyGenerations.professional;

  if (todayCount >= dailyLimit) {
    return res.status(429).json({
      success: false,
      message: `Daily generation limit reached (${dailyLimit}). Please try again tomorrow.`,
    });
  }

  // Gather context sources
  let lessonPlan = null;
  if (lessonPlanId) {
    lessonPlan = await LessonPlan.findById(lessonPlanId)
      .populate("standardIds", "code name description")
      .lean();
  }

  let extractions = [];
  if (extractionIds?.length) {
    extractions = await PresentationExtraction.find({
      _id: { $in: extractionIds },
      school: req.schoolId,
    }).lean();
  }

  let template = null;
  if (templateId) {
    template = await PresentationTemplate.findById(templateId)
      .setOptions({ skipTenantFilter: true })
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    const canUseTemplate =
      template.isGlobal ||
      (template.school && template.school.toString() === req.schoolId.toString());

    if (!canUseTemplate) {
      return res.status(403).json({
        success: false,
        message: "Template does not belong to your school",
      });
    }
  }

  let standards = [];
  if (standardIds?.length) {
    standards = await Standard.find({ _id: { $in: standardIds } })
      .select("code name description")
      .lean();
  } else if (lessonPlan?.standardIds?.length) {
    standards = lessonPlan.standardIds;
  }

  // Build context and generate
  const context = buildContext({
    lessonPlan,
    extractions,
    template,
    prompt,
    standards,
    requestedLanguages,
  });

  const result = await generateSlides({
    context,
    slideCount: Math.min(Math.max(slideCount, PRESENTATION_LIMITS.minSlides), PRESENTATION_LIMITS.maxSlides),
    schoolId: req.schoolId,
    userId: req.user._id,
    modelName: MODEL_NAME,
  });

  // PII scan
  const cleanSlides = scanAndRedactPII(result.slides);

  // Create presentation
  const presentation = await Presentation.create({
    school: req.schoolId,
    teacher: req.user._id,
    academicYear: req.academicYear,
    title: title || "Untitled Presentation",
    description,
    slides: cleanSlides,
    lessonPlan: lessonPlanId || undefined,
    class: classId || undefined,
    subject: subjectId || undefined,
    standards: standardIds || [],
    template: templateId || undefined,
    theme: theme || template?.defaultTheme || undefined,
    extractions: extractionIds || [],
    generation: {
      prompt,
      modelName: result.generation.modelName,
      inputTokens: result.generation.inputTokens,
      outputTokens: result.generation.outputTokens,
      totalTokens: result.generation.totalTokens,
      generatedAt: result.generation.generatedAt,
      durationMs: result.generation.durationMs,
      version: 1,
      language: requestedLanguages?.[0] || "en",
      requestedLanguages: requestedLanguages || ["en"],
    },
    status: "draft",
  });

  // Track token usage
  if (result.generation.totalTokens) {
    await AITokenUsage.create({
      model: MODEL_NAME,
      feature: "presentation_generate",
      school: req.schoolId,
      user: req.user._id,
      inputTokens: result.generation.inputTokens,
      outputTokens: result.generation.outputTokens,
      totalTokens: result.generation.totalTokens,
      schoolId: req.schoolId.toString(),
      metadata: { entityType: "Presentation", entityId: presentation._id },
    });
  }

  // Increment template usage count
  if (templateId) {
    await PresentationTemplate.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });
  }

  const populated = await Presentation.findById(presentation._id)
    .populate("teacher", "firstName lastName")
    .populate("class", "name")
    .populate("subject", "name")
    .populate("template", "name")
    .lean();

  res.status(201).json({
    success: true,
    data: { presentation: populated },
  });
});

// ─── Get single presentation ────────────────────────────────────────────────

export const getPresentation = asyncHandler(async (req, res) => {
  const presentation = await Presentation.findById(req.params.id)
    .populate("teacher", "firstName lastName")
    .populate("class", "name")
    .populate("subject", "name")
    .populate("standards", "code name")
    .populate("template", "name slideStructure")
    .populate("extractions", "originalName mimeType wordCount extractionStatus")
    .lean();

  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  // Access check: owner, shared user, or admin
  const isOwner = presentation.teacher._id.toString() === req.user._id.toString();
  const isShared = presentation.sharedWith?.some(
    (s) => s.user.toString() === req.user._id.toString()
  );
  const isAdmin = req.user.role === "admin" || req.user.role === "department_principal";

  if (!isOwner && !isShared && !isAdmin) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, data: { presentation } });
});

// ─── List presentations ─────────────────────────────────────────────────────

export const listPresentations = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, classId, subjectId, search } = req.query;

  const query = { school: req.schoolId };

  // Teachers see their own; admins see all
  if (req.user.role === "teacher") {
    query.$or = [
      { teacher: req.user._id },
      { "sharedWith.user": req.user._id },
    ];
  }

  if (status) query.status = status;
  if (classId) query.class = classId;
  if (subjectId) query.subject = subjectId;
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [presentations, total] = await Promise.all([
    Presentation.find(query)
      .populate("teacher", "firstName lastName")
      .populate("class", "name")
      .populate("subject", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Presentation.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      presentations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// ─── Update presentation metadata ──────────────────────────────────────────

export const updatePresentation = asyncHandler(async (req, res) => {
  const presentation = await Presentation.findById(req.params.id);

  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  if (req.user.role === "teacher" && presentation.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { title, description, theme, status } = req.body;
  if (title !== undefined) presentation.title = title;
  if (description !== undefined) presentation.description = description;
  if (theme) Object.assign(presentation.theme, theme);
  if (status) presentation.status = status;

  await presentation.save();

  res.json({ success: true, data: { presentation } });
});

// ─── Update single slide ────────────────────────────────────────────────────

export const updateSlide = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const slideIndex = parseInt(req.params.slideIndex);

  const presentation = await Presentation.findById(id);
  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  if (req.user.role === "teacher" && presentation.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
    return res.status(400).json({ success: false, message: "Invalid slide index" });
  }

  const { layout, title, subtitle, bodyHtml, bodyHtml2, speakerNotes, imageUrl, imageAlt, imageCaption } = req.body;
  const slide = presentation.slides[slideIndex];

  if (layout !== undefined) slide.layout = layout;
  if (title !== undefined) slide.title = title;
  if (subtitle !== undefined) slide.subtitle = subtitle;
  if (bodyHtml !== undefined) slide.bodyHtml = bodyHtml;
  if (bodyHtml2 !== undefined) slide.bodyHtml2 = bodyHtml2;
  if (speakerNotes !== undefined) slide.speakerNotes = speakerNotes;
  if (imageUrl !== undefined) slide.imageUrl = imageUrl;
  if (imageAlt !== undefined) slide.imageAlt = imageAlt;
  if (imageCaption !== undefined) slide.imageCaption = imageCaption;

  slide.aiGenerated = false;
  slide.editedAt = new Date();

  await presentation.save();

  res.json({ success: true, data: { slide: presentation.slides[slideIndex] } });
});

// ─── Regenerate single slide ────────────────────────────────────────────────

export const regenerateSlide = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const slideIndex = parseInt(req.params.slideIndex);
  const { prompt: teacherPrompt, keepLayout } = req.body;

  const presentation = await Presentation.findById(id);
  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  if (req.user.role === "teacher" && presentation.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
    return res.status(400).json({ success: false, message: "Invalid slide index" });
  }

  const result = await regenerateSingleSlide({
    presentation,
    slideIndex,
    teacherPrompt,
    keepLayout: keepLayout !== false,
    schoolId: req.schoolId,
    userId: req.user._id,
    modelName: MODEL_NAME,
  });

  // Update slide in place
  Object.assign(presentation.slides[slideIndex], result.slide, {
    aiGenerated: true,
    editedAt: new Date(),
  });

  presentation.generation.version = (presentation.generation.version || 1) + 1;
  await presentation.save();

  // Track token usage
  if (result.tokenUsage?.total) {
    await AITokenUsage.create({
      model: MODEL_NAME,
      feature: "presentation_regenerate_slide",
      school: req.schoolId,
      user: req.user._id,
      inputTokens: result.tokenUsage.input,
      outputTokens: result.tokenUsage.output,
      totalTokens: result.tokenUsage.total,
      schoolId: req.schoolId.toString(),
      metadata: { entityType: "Presentation", entityId: presentation._id, slideIndex },
    });
  }

  res.json({ success: true, data: { slide: presentation.slides[slideIndex] } });
});

// ─── Reorder slides ─────────────────────────────────────────────────────────

export const reorderSlides = asyncHandler(async (req, res) => {
  const presentation = await Presentation.findById(req.params.id);
  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  if (req.user.role === "teacher" && presentation.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { slideOrder } = req.body;

  if (!Array.isArray(slideOrder) || slideOrder.length !== presentation.slides.length) {
    return res.status(400).json({ success: false, message: "Invalid slide order" });
  }

  // Validate all indices are present
  const sorted = [...slideOrder].sort((a, b) => a - b);
  const expected = Array.from({ length: presentation.slides.length }, (_, i) => i);
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    return res.status(400).json({ success: false, message: "Invalid slide order indices" });
  }

  const reordered = slideOrder.map((oldIdx, newIdx) => {
    const slide = presentation.slides[oldIdx].toObject();
    slide.order = newIdx;
    return slide;
  });

  presentation.slides = reordered;
  await presentation.save();

  res.json({ success: true, data: { slides: presentation.slides } });
});

// ─── Export to PDF ──────────────────────────────────────────────────────────

export const exportPdf = asyncHandler(async (req, res) => {
  const presentation = await Presentation.findById(req.params.id)
    .populate("template", "defaultTheme")
    .lean();

  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  const isOwner = presentation.teacher.toString() === req.user._id.toString();
  const isShared = presentation.sharedWith?.some(
    (s) => s.user.toString() === req.user._id.toString()
  );
  const isAdmin = req.user.role === "admin" || req.user.role === "department_principal";

  if (!isOwner && !isShared && !isAdmin) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const pdfBuffer = await exportPresentationPdf(presentation, {
    schoolName: req.school?.name,
    schoolLogo: req.school?.logo,
  });

  const safeTitle = (presentation.title || "presentation").replace(/[^a-zA-Z0-9-_ ]/g, "");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
    "Content-Length": pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

// ─── Delete presentation ────────────────────────────────────────────────────

export const deletePresentation = asyncHandler(async (req, res) => {
  const presentation = await Presentation.findById(req.params.id);
  if (!presentation) {
    return res.status(404).json({ success: false, message: "Presentation not found" });
  }

  if (req.user.role === "teacher" && presentation.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Clean up linked extractions' Firebase files
  if (presentation.extractions?.length) {
    const extractionDocs = await PresentationExtraction.find({
      _id: { $in: presentation.extractions },
    }).lean();

    for (const ext of extractionDocs) {
      try {
        if (ext.storagePath) await deleteFile(ext.storagePath);
      } catch (err) {
        console.error(`Failed to delete file ${ext.storagePath}:`, err.message);
      }
    }

    await PresentationExtraction.deleteMany({ _id: { $in: presentation.extractions } });
  }

  await Presentation.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: "Presentation deleted" });
});

// ─── Template CRUD ──────────────────────────────────────────────────────────

export const listTemplates = asyncHandler(async (req, res) => {
  await ensureGlobalPresentationTemplates();

  const templates = await PresentationTemplate.find({
    $or: [
      { school: req.schoolId, isActive: true },
      { isGlobal: true, isActive: true },
    ],
  })
    .setOptions({ skipTenantFilter: true })
    .sort({ usageCount: -1 })
    .lean();

  res.json({ success: true, data: { templates } });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const { name, description, category, slideStructure, defaultTheme } = req.body;

  const template = await PresentationTemplate.create({
    school: req.schoolId,
    name,
    description,
    category,
    slideStructure,
    defaultTheme,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: { template } });
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const template = await PresentationTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  // Only allow updating school-scoped templates (not global)
  if (template.isGlobal && req.user.role !== "super_admin") {
    return res.status(403).json({ success: false, message: "Cannot modify global templates" });
  }

  const { name, description, category, slideStructure, defaultTheme, isActive } = req.body;
  if (name !== undefined) template.name = name;
  if (description !== undefined) template.description = description;
  if (category !== undefined) template.category = category;
  if (slideStructure !== undefined) template.slideStructure = slideStructure;
  if (defaultTheme) Object.assign(template.defaultTheme, defaultTheme);
  if (isActive !== undefined) template.isActive = isActive;

  await template.save();

  res.json({ success: true, data: { template } });
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await PresentationTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  if (template.isGlobal && req.user.role !== "super_admin") {
    return res.status(403).json({ success: false, message: "Cannot delete global templates" });
  }

  await PresentationTemplate.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: "Template deleted" });
});
