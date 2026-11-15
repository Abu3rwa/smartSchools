export const computeHomeProgress = (goals = []) => {
  const tasks = goals.flatMap((goal) => goal.homeTasks || []);
  const done = tasks.filter((task) => task.status === "done").length;
  const needHelp = tasks.filter((task) => task.status === "need_help").length;
  const total = tasks.length;
  const open = Math.max(total - done - needHelp, 0);
  return { done, needHelp, total, open };
};
