export const API_URL = '/api';
export default {
  get: async (url) => {
    if (url !== '/language-games/student/home') throw new Error(`Unexpected preview request: ${url}`);
    return { data: { data: { profile: { xp: 0, level: 1, intoLevel: 0, nextLevelAt: 100, weeklyGoalDays: 3 }, week: { daysThisWeek: 0 }, inProgress: [], assignments: [], packs: [] } } };
  }
};
