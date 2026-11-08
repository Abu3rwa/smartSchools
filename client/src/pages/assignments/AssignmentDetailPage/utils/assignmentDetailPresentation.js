export const getSafeUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};

export const formatDateTime = (value, locale) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const getValidLessonPlans = (assignment) => {
  if (!Array.isArray(assignment?.lessonPlans)) return [];
  return assignment.lessonPlans.filter((item) => item && (item.title || item.date));
};

// Mirrors the server's resource list so the page and the emails never disagree:
// external links, Drive files, uploaded files, and the Classroom coursework.
export const collectAssignmentResources = (assignment) => {
  const resources = [];
  const seen = new Set();

  const push = (key, title, rawUrl) => {
    const url = getSafeUrl(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    resources.push({ key: key || url, title: title || url, url });
  };

  const pushReference = (key, title) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    resources.push({ key, title, url: '' });
  };

  for (const link of Array.isArray(assignment?.links) ? assignment.links : []) {
    if (link?.type === 'external_url') {
      push(link._id, link.title, link.url);
    } else if (link?.type === 'practice_objective' || link?.type === 'assessment') {
      // In-app references (a standard or another assessment) have no URL to open.
      pushReference(
        link._id || `${link.type}-${link.refId}`,
        String(link.title || '').trim()
      );
    }
  }
  for (const att of Array.isArray(assignment?.driveAttachments) ? assignment.driveAttachments : []) {
    push(att?.fileId, att?.fileName, att?.webViewLink);
  }
  for (const att of Array.isArray(assignment?.attachments) ? assignment.attachments : []) {
    push(att?._id, att?.fileName, att?.url);
  }

  return resources.filter((resource) => resource.title);
};
