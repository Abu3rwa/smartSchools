export const chapterStatus = (chapter) => {
  if (chapter?.locked) return 'locked';
  if (chapter?.completed) return 'completed';
  if (chapter?.readingGate?.readStartedAt || chapter?.readingGate?.readFinishedAt) return 'inProgress';
  if (Number(chapter?.fluency?.partsDone) > 0) return 'inProgress';
  return 'new';
};
