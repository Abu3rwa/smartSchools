export const STATUS_OPTIONS = [
  "all",
  "draft",
  "published",
  "closed",
  "archived",
];

export const LINK_TYPES = [
  { value: "external_url", label: "External URL" },
  { value: "assessment", label: "Assessment" },
  { value: "practice_objective", label: "Standard / Objective" },
];

export const DEFAULT_ASSIGNMENT_FORM = {
  assignmentTypeId: "",
  title: "",
  summary: "",
  instructions: "",
  lessonPlanIds: [],
  dueDate: "",
  maxMarks: 10,
  publishNow: false,
  classroomPublish: false,
  notifyOnAssign: true,
  notifyAudience: "both",
  notifyOnGrade: true,
  links: [],
  attachmentFiles: [],
  pendingDriveFiles: [],
  existingAttachments: [],
  existingDriveAttachments: [],
  removeAttachmentIds: [],
  createGoogleForm: false,
  googleFormQuestions: [],
  scope: "class",
  studentIds: [],
};

export const createDefaultAssignmentForm = () => ({
  ...DEFAULT_ASSIGNMENT_FORM,
  links: [],
  attachmentFiles: [],
  pendingDriveFiles: [],
  existingAttachments: [],
  existingDriveAttachments: [],
  removeAttachmentIds: [],
  createGoogleForm: false,
  googleFormQuestions: [],
  scope: "class",
  studentIds: [],
});
