export const PRESENTATION_FEATURE_FLAGS = {
  patchEditing: process.env.PRESENTATION_PATCH_EDITING !== "false",
  applyLayout: process.env.PRESENTATION_APPLY_LAYOUT !== "false",
  collaborationComments: process.env.PRESENTATION_COLLAB_COMMENTS !== "false",
};
