const MC_LABELS = ["A", "B", "C", "D"];

export const GRAMMAR_LEVELS = [
  "beginner",
  "elementary",
  "pre_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];

const QUESTION_TYPES = ["multiple_choice", "true_false"];
const DIFFICULTIES = ["easy", "medium", "hard"];

const LEVEL_ALIASES = {
  beginner: "beginner",
  elementary: "elementary",
  "pre-intermediate": "pre_intermediate",
  pre_intermediate: "pre_intermediate",
  "pre intermediate": "pre_intermediate",
  intermediate: "intermediate",
  "upper-intermediate": "upper_intermediate",
  upper_intermediate: "upper_intermediate",
  "upper intermediate": "upper_intermediate",
  advanced: "advanced",
};

const GRAMMAR_BANK = [
  {
    level: "beginner",
    skill: "subject pronouns",
    subskill: "i/you/he/she",
    multiple_choice: {
      prompt: "___ am ready for class.",
      correct: "I",
      distractors: ["Me", "My", "Mine"],
      explanation: "Use subject pronoun 'I' before the verb 'am'.",
    },
    true_false: {
      statement: "'Me' is a subject pronoun.",
      isTrue: false,
      explanation: "'Me' is an object pronoun, not a subject pronoun.",
    },
  },
  {
    level: "beginner",
    skill: "verb be present",
    subskill: "am/is/are",
    multiple_choice: {
      prompt: "She ___ my teacher.",
      correct: "is",
      distractors: ["am", "are", "be"],
      explanation: "Use 'is' with singular third person subjects like 'she'.",
    },
    true_false: {
      statement: "We use 'am' with 'you'.",
      isTrue: false,
      explanation: "We use 'are' with 'you'.",
    },
  },
  {
    level: "beginner",
    skill: "demonstratives",
    subskill: "this/that/these/those",
    multiple_choice: {
      prompt: "___ books on the desk are mine.",
      correct: "These",
      distractors: ["This", "That", "Those"],
      explanation: "Use 'these' for plural nouns that are near.",
    },
    true_false: {
      statement: "'That' is usually used for singular things far from the speaker.",
      isTrue: true,
      explanation: "That is correct usage for 'that'.",
    },
  },
  {
    level: "beginner",
    skill: "articles",
    subskill: "a/an/the",
    multiple_choice: {
      prompt: "I saw ___ elephant at the zoo.",
      correct: "an",
      distractors: ["a", "the", "-"],
      explanation: "Use 'an' before words that start with a vowel sound.",
    },
    true_false: {
      statement: "We use 'a' before words that start with a vowel sound.",
      isTrue: false,
      explanation: "Use 'an' before vowel sounds.",
    },
  },
  {
    level: "beginner",
    skill: "basic prepositions",
    subskill: "in/at/to",
    multiple_choice: {
      prompt: "We study ___ the library every day.",
      correct: "in",
      distractors: ["to", "at", "on"],
      explanation: "Use 'in' for enclosed places like a room or library.",
    },
    true_false: {
      statement: "'Go to school' uses the preposition 'to'.",
      isTrue: true,
      explanation: "This is the standard expression.",
    },
  },
  {
    level: "elementary",
    skill: "present simple",
    subskill: "third person singular",
    multiple_choice: {
      prompt: "He ___ football on Fridays.",
      correct: "plays",
      distractors: ["play", "playing", "played"],
      explanation: "In present simple, add -s for he/she/it.",
    },
    true_false: {
      statement: "In present simple, we usually add -s with 'he'.",
      isTrue: true,
      explanation: "That is correct for third person singular.",
    },
  },
  {
    level: "elementary",
    skill: "present continuous",
    subskill: "be + verb-ing",
    multiple_choice: {
      prompt: "They ___ dinner right now.",
      correct: "are cooking",
      distractors: ["cook", "cooks", "cooked"],
      explanation: "Present continuous uses be + verb-ing.",
    },
    true_false: {
      statement: "'I am study now' is correct present continuous.",
      isTrue: false,
      explanation: "It should be 'I am studying now'.",
    },
  },
  {
    level: "elementary",
    skill: "adverbs of frequency",
    subskill: "position in sentence",
    multiple_choice: {
      prompt: "She ___ walks to school.",
      correct: "often",
      distractors: ["is", "are", "did"],
      explanation: "Adverbs of frequency often come before the main verb.",
    },
    true_false: {
      statement: "'Never' can be an adverb of frequency.",
      isTrue: true,
      explanation: "Yes, it shows frequency at 0 percent.",
    },
  },
  {
    level: "elementary",
    skill: "past simple",
    subskill: "regular and irregular verbs",
    multiple_choice: {
      prompt: "Yesterday, we ___ to the museum.",
      correct: "went",
      distractors: ["go", "goed", "going"],
      explanation: "The past simple of 'go' is 'went'.",
    },
    true_false: {
      statement: "'Play' in past simple is 'played'.",
      isTrue: true,
      explanation: "That is the regular past form.",
    },
  },
  {
    level: "elementary",
    skill: "like plus ing",
    subskill: "verb patterns",
    multiple_choice: {
      prompt: "I like ___ in the sea.",
      correct: "swimming",
      distractors: ["swim", "to swiming", "swam"],
      explanation: "After 'like', gerund (-ing) is common.",
    },
    true_false: {
      statement: "'I like to swimming' is standard grammar.",
      isTrue: false,
      explanation: "Use either 'I like swimming' or 'I like to swim'.",
    },
  },
  {
    level: "pre_intermediate",
    skill: "past continuous",
    subskill: "was/were + verb-ing",
    multiple_choice: {
      prompt: "At 8 PM, they ___ TV.",
      correct: "were watching",
      distractors: ["watched", "are watching", "watch"],
      explanation: "Past continuous describes an action in progress in the past.",
    },
    true_false: {
      statement: "Past continuous always uses was or were with verb-ing.",
      isTrue: true,
      explanation: "That is the core structure.",
    },
  },
  {
    level: "pre_intermediate",
    skill: "connectors",
    subskill: "because/but/although",
    multiple_choice: {
      prompt: "I stayed home ___ it was raining.",
      correct: "because",
      distractors: ["but", "although", "so"],
      explanation: "'Because' gives the reason.",
    },
    true_false: {
      statement: "'Although' can introduce contrast in a sentence.",
      isTrue: true,
      explanation: "Yes, 'although' marks contrast.",
    },
  },
  {
    level: "pre_intermediate",
    skill: "future forms",
    subskill: "going to / will",
    multiple_choice: {
      prompt: "Look at those clouds. It ___ rain.",
      correct: "is going to",
      distractors: ["will", "was", "has"],
      explanation: "Use 'going to' for visible evidence and plans.",
    },
    true_false: {
      statement: "We can use 'will' for quick decisions made at the moment of speaking.",
      isTrue: true,
      explanation: "That is a common use of 'will'.",
    },
  },
  {
    level: "pre_intermediate",
    skill: "present perfect",
    subskill: "ever/never/for/since",
    multiple_choice: {
      prompt: "She has lived here ___ 2018.",
      correct: "since",
      distractors: ["for", "ever", "never"],
      explanation: "Use 'since' with a starting point in time.",
    },
    true_false: {
      statement: "Use 'for' with a duration, like 'for three years'.",
      isTrue: true,
      explanation: "Correct, 'for' is used with periods of time.",
    },
  },
  {
    level: "pre_intermediate",
    skill: "comparatives and superlatives",
    subskill: "more/most and -er/-est",
    multiple_choice: {
      prompt: "This exercise is ___ than the last one.",
      correct: "easier",
      distractors: ["easiest", "easy", "more easy"],
      explanation: "Use comparative form for two-item comparison.",
    },
    true_false: {
      statement: "'The most interesting' is a superlative form.",
      isTrue: true,
      explanation: "Yes, it compares one against many.",
    },
  },
  {
    level: "intermediate",
    skill: "present perfect vs present perfect continuous",
    subskill: "state vs duration",
    multiple_choice: {
      prompt: "I ___ this book for two weeks.",
      correct: "have been reading",
      distractors: ["read", "have readed", "am reading"],
      explanation: "Use present perfect continuous for ongoing duration.",
    },
    true_false: {
      statement: "Present perfect continuous is often used with 'for' and 'since'.",
      isTrue: true,
      explanation: "Correct, these time markers fit ongoing duration.",
    },
  },
  {
    level: "intermediate",
    skill: "past perfect",
    subskill: "sequence of past actions",
    multiple_choice: {
      prompt: "By the time we arrived, the movie ___.",
      correct: "had started",
      distractors: ["has started", "started", "was starting"],
      explanation: "Past perfect marks the earlier past action.",
    },
    true_false: {
      statement: "Past perfect can show an action completed before another past action.",
      isTrue: true,
      explanation: "That is its main function.",
    },
  },
  {
    level: "intermediate",
    skill: "reported speech",
    subskill: "tense backshift",
    multiple_choice: {
      prompt: "Direct: 'I am tired.' Reported: He said he ___ tired.",
      correct: "was",
      distractors: ["is", "be", "has"],
      explanation: "Reported speech usually shifts tense back.",
    },
    true_false: {
      statement: "In reported speech, present simple can change to past simple.",
      isTrue: true,
      explanation: "This is common when reporting later.",
    },
  },
  {
    level: "intermediate",
    skill: "passive voice",
    subskill: "be plus past participle",
    multiple_choice: {
      prompt: "The homework ___ by the teacher yesterday.",
      correct: "was checked",
      distractors: ["checked", "is checking", "has check"],
      explanation: "Past passive uses was/were + past participle.",
    },
    true_false: {
      statement: "'The cake was made by Sara' is passive voice.",
      isTrue: true,
      explanation: "The subject receives the action.",
    },
  },
  {
    level: "intermediate",
    skill: "conditionals",
    subskill: "first and second conditional",
    multiple_choice: {
      prompt: "If I ___ the exam, I will celebrate.",
      correct: "pass",
      distractors: ["passed", "will pass", "would pass"],
      explanation: "First conditional uses present simple in the if clause.",
    },
    true_false: {
      statement: "Second conditional often uses 'would' in the main clause.",
      isTrue: true,
      explanation: "Yes, that is the typical pattern.",
    },
  },
  {
    level: "upper_intermediate",
    skill: "the more the more",
    subskill: "double comparatives",
    multiple_choice: {
      prompt: "The more you practice, the ___ you improve.",
      correct: "more",
      distractors: ["most", "much", "many"],
      explanation: "Double comparative uses 'the more..., the more...'.",
    },
    true_false: {
      statement: "'The more you learn, the more you know' is a valid comparative structure.",
      isTrue: true,
      explanation: "It is the standard double comparative pattern.",
    },
  },
  {
    level: "upper_intermediate",
    skill: "adjective order",
    subskill: "opinion size age color material",
    multiple_choice: {
      prompt: "She bought a ___ table.",
      correct: "beautiful old wooden",
      distractors: ["wooden old beautiful", "old beautiful wooden", "beautiful wooden old"],
      explanation: "A natural order is opinion, age, then material.",
    },
    true_false: {
      statement: "In English, adjective order is always random.",
      isTrue: false,
      explanation: "Adjective order follows common patterns.",
    },
  },
  {
    level: "upper_intermediate",
    skill: "future perfect",
    subskill: "will have plus past participle",
    multiple_choice: {
      prompt: "By 2030, scientists ___ many new treatments.",
      correct: "will have discovered",
      distractors: ["discover", "have discovered", "will discovering"],
      explanation: "Future perfect shows completion before a future time.",
    },
    true_false: {
      statement: "Future perfect can describe actions completed before a specific future point.",
      isTrue: true,
      explanation: "That is exactly how it is used.",
    },
  },
  {
    level: "upper_intermediate",
    skill: "reporting verbs",
    subskill: "advise/recommend/warn",
    multiple_choice: {
      prompt: "She recommended ___ earlier.",
      correct: "leaving",
      distractors: ["leave", "to leaving", "left"],
      explanation: "'Recommend' is commonly followed by gerund (-ing).",
    },
    true_false: {
      statement: "Reporting verbs can replace a basic 'said' sentence in advanced writing.",
      isTrue: true,
      explanation: "They add precision in meaning.",
    },
  },
  {
    level: "upper_intermediate",
    skill: "third conditional",
    subskill: "if had plus past participle",
    multiple_choice: {
      prompt: "If I had known, I ___ earlier.",
      correct: "would have come",
      distractors: ["will come", "came", "would come"],
      explanation: "Third conditional uses if + past perfect, would have + participle.",
    },
    true_false: {
      statement: "Third conditional talks about unreal past situations.",
      isTrue: true,
      explanation: "It describes imagined past outcomes.",
    },
  },
  {
    level: "advanced",
    skill: "inversion",
    subskill: "negative adverbials",
    multiple_choice: {
      prompt: "Rarely ___ such a thoughtful answer.",
      correct: "have I heard",
      distractors: ["I have heard", "heard I have", "I heard have"],
      explanation: "Negative adverbials often trigger inversion.",
    },
    true_false: {
      statement: "'Little did he know...' is an example of inversion for emphasis.",
      isTrue: true,
      explanation: "This is a classic inversion structure.",
    },
  },
  {
    level: "advanced",
    skill: "mixed conditionals",
    subskill: "past condition present result",
    multiple_choice: {
      prompt: "If she had studied medicine, she ___ a doctor now.",
      correct: "would be",
      distractors: ["will be", "is", "would have been"],
      explanation: "Mixed conditional can link past condition to present result.",
    },
    true_false: {
      statement: "Mixed conditionals can combine different time references.",
      isTrue: true,
      explanation: "They mix past and present/future logic.",
    },
  },
  {
    level: "advanced",
    skill: "cleft sentences",
    subskill: "the reason why/the thing that",
    multiple_choice: {
      prompt: "___ I called is to confirm your appointment.",
      correct: "The reason why",
      distractors: ["Because", "Although", "Despite"],
      explanation: "Cleft structures help emphasize information.",
    },
    true_false: {
      statement: "Cleft sentences are used to add emphasis to a sentence part.",
      isTrue: true,
      explanation: "They highlight a chosen element.",
    },
  },
  {
    level: "advanced",
    skill: "so and such",
    subskill: "intensifiers",
    multiple_choice: {
      prompt: "It was ___ difficult test that many students asked for more time.",
      correct: "such a",
      distractors: ["so", "such", "so a"],
      explanation: "Use 'such a' before adjective + singular count noun.",
    },
    true_false: {
      statement: "'So' is used directly before adjectives or adverbs.",
      isTrue: true,
      explanation: "That is the standard pattern.",
    },
  },
  {
    level: "advanced",
    skill: "participle phrases",
    subskill: "reduced relative clauses",
    multiple_choice: {
      prompt: "The boy, ___ by his coach, improved quickly.",
      correct: "encouraged",
      distractors: ["encourage", "encouraging", "was encouraged"],
      explanation: "Participle phrases reduce relative clauses.",
    },
    true_false: {
      statement: "Participle phrases can make writing more concise.",
      isTrue: true,
      explanation: "They reduce repetition and improve flow.",
    },
  },
];

const toSeedNumber = (value) => {
  if (Number.isFinite(value)) return Math.abs(Math.trunc(Number(value)));
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const rotateArray = (values, steps) => {
  if (!Array.isArray(values) || values.length === 0) return [];
  const offset = steps % values.length;
  if (offset === 0) return [...values];
  return [...values.slice(offset), ...values.slice(0, offset)];
};

export const normalizeGrammarLevel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return LEVEL_ALIASES[normalized] || null;
};

export const normalizeGrammarLevels = (values, { fallbackAll = false } = {}) => {
  const source = Array.isArray(values) ? values : [values];
  const normalized = Array.from(
    new Set(source.map((value) => normalizeGrammarLevel(value)).filter(Boolean))
  );
  if (normalized.length > 0) return normalized;
  return fallbackAll ? [...GRAMMAR_LEVELS] : [];
};

export const hasGrammarLevelingEnabled = (practiceConfig = {}) =>
  Boolean(practiceConfig?.enableGrammarLeveling);

const normalizeQuestionType = (questionType) =>
  QUESTION_TYPES.includes(questionType) ? questionType : "multiple_choice";

const normalizeDifficulty = (difficulty) =>
  DIFFICULTIES.includes(difficulty) ? difficulty : "medium";

const buildMultipleChoiceQuestion = ({ item, difficulty, seed }) => {
  const details = item.multiple_choice;
  const answers = [details.correct, ...(details.distractors || [])].slice(0, 4);
  while (answers.length < 4) {
    answers.push(`Option ${answers.length + 1}`);
  }
  const rotated = rotateArray(answers, toSeedNumber(seed) % answers.length);
  const correctIndex = rotated.findIndex((option) => option === details.correct);

  return {
    instruction: "Choose the best answer for this grammar question.",
    questionText: details.prompt,
    questionType: "multiple_choice",
    options: rotated.map((text, index) => ({
      label: MC_LABELS[index],
      text,
    })),
    correctAnswer: MC_LABELS[Math.max(0, correctIndex)],
    explanation: details.explanation || "",
    difficulty,
    skill: item.skill || "",
    subskill: item.subskill || "",
    grammarLevel: item.level,
    gradingMode: "exact_match",
    acceptableAnswers: [],
    evaluationCriteria: "",
  };
};

const buildTrueFalseQuestion = ({ item, difficulty }) => {
  const details = item.true_false;
  return {
    instruction: "Read the statement and choose True or False.",
    questionText: details.statement,
    questionType: "true_false",
    options: [
      { label: "A", text: "True" },
      { label: "B", text: "False" },
    ],
    correctAnswer: details.isTrue ? "True" : "False",
    explanation: details.explanation || "",
    difficulty,
    skill: item.skill || "",
    subskill: item.subskill || "",
    grammarLevel: item.level,
    gradingMode: "exact_match",
    acceptableAnswers: [],
    evaluationCriteria: "",
  };
};

export const generateGrammarQuestion = ({
  levels = GRAMMAR_LEVELS,
  questionType = "multiple_choice",
  difficulty = "medium",
  preferredLevel = null,
  index = 0,
  seed = 0,
} = {}) => {
  const resolvedLevels = normalizeGrammarLevels(levels, { fallbackAll: true });
  const resolvedType = normalizeQuestionType(questionType);
  const resolvedDifficulty = normalizeDifficulty(difficulty);
  const resolvedPreferredLevel = normalizeGrammarLevel(preferredLevel);

  const priorityLevels =
    resolvedPreferredLevel && resolvedLevels.includes(resolvedPreferredLevel)
      ? [
          resolvedPreferredLevel,
          ...resolvedLevels.filter((level) => level !== resolvedPreferredLevel),
        ]
      : [...resolvedLevels];

  let candidates = GRAMMAR_BANK.filter(
    (item) => priorityLevels.includes(item.level) && item[resolvedType]
  );

  if (candidates.length === 0) {
    candidates = GRAMMAR_BANK.filter((item) => item[resolvedType]);
  }

  const seedNumber = toSeedNumber(seed) + toSeedNumber(index);
  const selectedIndex = candidates.length > 0 ? seedNumber % candidates.length : 0;
  const item = candidates[selectedIndex] || GRAMMAR_BANK[0];

  if (resolvedType === "true_false") {
    return buildTrueFalseQuestion({ item, difficulty: resolvedDifficulty });
  }

  return buildMultipleChoiceQuestion({
    item,
    difficulty: resolvedDifficulty,
    seed: `${seed}|${index}|${item.level}`,
  });
};

export const generateGrammarQuestionPool = ({
  questionCount = 10,
  allowedQuestionTypes = QUESTION_TYPES,
  allowedDifficulties = DIFFICULTIES,
  levels = GRAMMAR_LEVELS,
  seedPrefix = "grammar-pool",
} = {}) => {
  const total = Math.max(1, Math.trunc(Number(questionCount) || 1));
  const questionTypes = Array.isArray(allowedQuestionTypes)
    ? allowedQuestionTypes.filter((item) => QUESTION_TYPES.includes(item))
    : [];
  const difficulties = Array.isArray(allowedDifficulties)
    ? allowedDifficulties.filter((item) => DIFFICULTIES.includes(item))
    : [];

  const resolvedQuestionTypes =
    questionTypes.length > 0 ? questionTypes : [...QUESTION_TYPES];
  const resolvedDifficulties =
    difficulties.length > 0 ? difficulties : [...DIFFICULTIES];
  const resolvedLevels = normalizeGrammarLevels(levels, { fallbackAll: true });

  const questions = [];
  for (let index = 0; index < total; index += 1) {
    const questionType =
      resolvedQuestionTypes[index % resolvedQuestionTypes.length];
    const difficulty = resolvedDifficulties[index % resolvedDifficulties.length];
    const preferredLevel = resolvedLevels[index % resolvedLevels.length];

    questions.push(
      generateGrammarQuestion({
        levels: resolvedLevels,
        questionType,
        difficulty,
        preferredLevel,
        index,
        seed: `${seedPrefix}|${index}|${questionType}|${difficulty}|${preferredLevel}`,
      })
    );
  }

  return questions;
};
