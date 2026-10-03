const HEADERS = [
  'title', 'date', 'class', 'subject', 'teacher_email', 'week_number', 'topic',
  'summary', 'description', 'previous_knowledge', 'teaching_objectives', 'learning_objectives',
  'objectives', 'standards', 'vocabulary', 'character_trait_links', 'tech_integration',
  'activities', 'assessment_methods', 'resources', 'differentiation', 'homework', 'notes',
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
    `stage_${i}_name`, `stage_${i}_procedure`, `stage_${i}_materials`, `stage_${i}_timing`,
  ]),
];

const list = (items) => {
  const names = [...new Set((items || []).map((item) => item?.name).filter(Boolean))];
  return names.length ? names.join(' | ') : '(use the exact class/subject names used in my school)';
};

export const buildLessonPlanCsvPrompt = ({ classes = [], subjects = [] } = {}) => `You are a data-conversion assistant. Convert the lesson plans I give you (pasted below or attached) into ONE CSV file that can be imported into a school management system.

OUTPUT RULES
- Output ONLY the CSV inside a single code block. No explanations before or after.
- The first line must be exactly this header row, in this order:
${HEADERS.join(',')}
- One lesson plan per row. Wrap every cell in double quotes and escape inner quotes by doubling them ("").
- Use UTF-8. Keep Arabic text as is. Never translate my content.
- Leave a cell empty ("") when the information is not in my lesson plan. Never invent data.

COLUMN RULES
- title (required): lesson title.
- date (required): YYYY-MM-DD, for example 2026-10-05. If I only give a day or week, ask me for the date instead of guessing.
- class (required): must match EXACTLY one of: ${list(classes)}
- subject (required): must match EXACTLY one of: ${list(subjects)}
- teacher_email: leave empty unless I give a teacher's email.
- week_number: whole number from 1 to 52, or empty.
- topic, summary, description, previous_knowledge, teaching_objectives, learning_objectives, vocabulary, character_trait_links, tech_integration, activities, assessment_methods, resources, differentiation, homework, notes: plain text. Put multiple items in one cell separated by a semicolon and a space ("; "). No HTML or markdown.
- objectives: the lesson objectives, separated by "; ".
- standards: standard codes separated by "; " (for example "CCSS.ELA-LITERACY.RL.5.1"). Use the code only, not the description.
- Stages (up to 6): for each stage N fill stage_N_name, stage_N_procedure, stage_N_materials, stage_N_timing (for example "10 min"). Use these stage names in this order unless my plan says otherwise: 1 "Warm Up", 2 "Presentation of Content", 3 "Guided Practice", 4 "Individual Practice", 5 "Homework/Take Home Material". Leave unused stages empty. If a plan has more than 6 stages, merge the extra ones into stage 6.
- teaching_objectives and objectives: put the same objectives text in both columns (separated by "; ").

BEFORE YOU ANSWER
- Every row must have exactly ${HEADERS.length} columns.
- Check that dates are valid and that class and subject match the lists above.
- If anything required is missing or unclear, ask me first, then produce the CSV.

MY LESSON PLANS:
- If I pasted or attached lesson plans (Word, PDF, text, table, photo), convert them exactly.
- If I gave nothing, or only a topic/outline, ask me for the missing details (class, subject, date, objectives, stages), then write the lesson plan(s) and output them as CSV.
[Paste or attach your lesson plans here, or describe the lesson you want]
`;
