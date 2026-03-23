# Plan: AI Lesson Planning Context Enhancement (Simplified)

## Overview
This plan outlines enhancements to the AI lesson planning feature to provide more context to the AI using **PDF files** and **plain text**. To keep the system lightweight, we will not store the actual files. Instead, we will extract text from uploaded PDFs in real-time and save only the extracted text into the lesson plan.

## 1. Data Model Enhancements

### `models/LessonPlan.js`
Add two new string fields to store the additional context:
- `contextText`: String (optional), manual notes/context provided by the teacher.
- `extractedMaterialText`: String (optional), the text extracted from an uploaded PDF. 
22222112222222233

*Note: No `attachments` array or file metadata will be stored.*

## 2. API & Controller Enhancements

### New Middleware: `middleware/uploadLessonPlanContext.js`
- A memory-based multer middleware.
- **Allowed MIME type**: `application/pdf` only.
- **Limit**: 1 file per request, 10MB max.
- The file is processed in memory and never written to disk or cloud storage.

### `controllers/lessonPlanController.js`
- **`createLessonPlan` & `updateLessonPlan`**:
  - If a PDF is uploaded, use `pdf-parse` to extract its text.
  - Save the extracted string into `extractedMaterialText`.
  - Save manual notes into `contextText`.
- **AI Endpoints (`suggestField`, `detectStandards`, `generateSection`)**:
  - Update to accept these context strings.
  - Combine `contextText` and `extractedMaterialText` into the AI prompt context.

## 3. Service Enhancements

### `services/lessonPlanAIService.js`
- Update AI functions (`suggestFieldContent`, `generateSection`, etc.) to include a new context block in the prompt:
  ```
  ADDITIONAL RESEARCH & MATERIALS:
  ${manualContext}
  ${extractedPdfContent}
  ```
- The AI will be instructed to treat this as the "Source of Truth" for the lesson's specific details.

## 4. Implementation Steps

1.  **Model**: Add `contextText` and `extractedMaterialText` to `LessonPlan.js`.
2.  **Middleware**: Create `uploadLessonPlanContext.js` (PDF only, memory storage).
3.  **Text Extraction**: Implement a helper that uses the existing `pdf-parse` library to convert the uploaded buffer to a string.
4.  **Controller**: Update CRUD logic to handle the PDF upload, extract text, and save the string.
5.  **AI Service**: Update prompts to utilize the new context fields.

## 5. Optimization
- **Text Cleaning**: Strip excessive whitespace or special characters from the PDF output before saving to the DB.
- **Safety**: If PDF extraction fails, the system will still save the rest of the lesson plan and inform the user that the file context couldn't be read.
