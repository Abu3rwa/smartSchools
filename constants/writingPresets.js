/**
 * Section and rubric starting points for the Writing Assistant.
 * Teachers get these pre-filled and edit them; nothing here is enforced as a rule.
 */

export const WRITING_TYPES = [
    'essay',
    'paragraph',
    'story',
    'letter',
    'report',
    'description',
    'review',
    'custom'
];

export const SECTION_KINDS = [
    'opening',
    'body',
    'counterargument',
    'rebuttal',
    'conclusion',
    'greeting',
    'signoff',
    'custom'
];

export const WRITING_STAGES = [
    'not_started',
    'drafting',
    'submitted',
    'feedback_ready',
    'feedback_published',
    'revising',
    'compared',
    'ready_for_notebook',
    'awaiting_notebook_check',
    'completed'
];

export const NOTEBOOK_STATES = [
    'not_requested',
    'requested',
    'checked',
    'revision_required'
];

const section = (key, label, kind, extra = {}) => ({
    key,
    label,
    kind,
    required: true,
    repeatable: false,
    minCount: 1,
    maxCount: 1,
    minWords: 0,
    instructions: '',
    criteria: [],
    ...extra
});

export const SECTION_PRESETS = {
    essay: () => [
        section('introduction', 'Introduction', 'opening', {
            instructions: 'Say what you think and name the two or three reasons you will use.',
            criteria: ['Clear point of view', 'Sets up the essay']
        }),
        section('body', 'Body paragraph', 'body', {
            repeatable: true,
            minCount: 2,
            maxCount: 4,
            instructions: 'One reason, then a detail or example that proves it.',
            criteria: ['Supporting detail', 'Stays on the point']
        }),
        section('counterargument', 'Counterargument', 'counterargument', {
            required: false,
            instructions: 'What would someone who disagrees say?',
            criteria: ['Fair view of the other side']
        }),
        section('rebuttal', 'Rebuttal', 'rebuttal', {
            required: false,
            instructions: 'Explain why your view is still stronger.',
            criteria: ['Answers the other side']
        }),
        section('conclusion', 'Conclusion', 'conclusion', {
            instructions: 'Restate your view in new words and say why it matters.',
            criteria: ['No new arguments', 'Strong closing']
        })
    ],
    paragraph: () => [
        section('topic', 'Topic sentence', 'opening', {
            instructions: 'One sentence that tells the reader the main idea.',
            criteria: ['Single clear idea']
        }),
        section('support', 'Supporting details', 'body', {
            repeatable: true,
            minCount: 2,
            maxCount: 4,
            instructions: 'Add a detail, fact, or example for each.',
            criteria: ['Relevant details']
        }),
        section('concluding', 'Concluding sentence', 'conclusion', {
            instructions: 'Close the idea without repeating the topic sentence word for word.',
            criteria: ['Wraps the paragraph up']
        })
    ],
    story: () => [
        section('beginning', 'Beginning', 'opening', {
            instructions: 'Introduce the character and where the story happens.',
            criteria: ['Sets the scene', 'A problem appears']
        }),
        section('middle', 'Middle', 'body', {
            repeatable: true,
            minCount: 2,
            maxCount: 4,
            instructions: 'Show what the character tries and what gets harder.',
            criteria: ['Events build', 'Shows rather than tells']
        }),
        section('ending', 'Ending', 'conclusion', {
            instructions: 'Resolve the problem and show how the character has changed.',
            criteria: ['Problem resolved', 'Satisfying close']
        })
    ],
    letter: () => [
        section('greeting', 'Greeting', 'greeting', {
            instructions: 'Who are you writing to?',
            criteria: ['Correct greeting']
        }),
        section('body', 'Body', 'body', {
            repeatable: true,
            minCount: 1,
            maxCount: 4,
            instructions: 'One point per paragraph.',
            criteria: ['Polite and clear', 'Purpose stated']
        }),
        section('signoff', 'Closing', 'signoff', {
            instructions: 'Sign off in a way that suits the reader.',
            criteria: ['Correct closing']
        })
    ],
    report: () => [
        section('introduction', 'Introduction', 'opening', {
            instructions: 'Say what you are reporting on and why it matters.',
            criteria: ['States the subject']
        }),
        section('information', 'Information section', 'body', {
            repeatable: true,
            minCount: 2,
            maxCount: 5,
            instructions: 'Use your own words. Label each part.',
            criteria: ['Factual', 'Organised under headings']
        }),
        section('conclusion', 'Conclusion', 'conclusion', {
            instructions: 'Summarise what the reader should remember.',
            criteria: ['No new facts']
        })
    ],
    description: () => [
        section('opening', 'Opening', 'opening', {
            instructions: 'Give the reader a first impression.',
            criteria: ['Clear subject']
        }),
        section('detail', 'Sensory detail', 'body', {
            repeatable: true,
            minCount: 2,
            maxCount: 4,
            instructions: 'Use what you can see, hear, smell, or feel.',
            criteria: ['Vivid word choice']
        }),
        section('closing', 'Closing', 'conclusion', {
            instructions: 'Leave the reader with the strongest image.',
            criteria: ['Consistent mood']
        })
    ],
    review: () => [
        section('introduction', 'What you are reviewing', 'opening', {
            instructions: 'Name it and give your overall verdict.',
            criteria: ['Verdict stated']
        }),
        section('strength', 'What works', 'body', {
            repeatable: true,
            minCount: 1,
            maxCount: 3,
            criteria: ['Backed by examples']
        }),
        section('weakness', 'What does not work', 'body', {
            repeatable: true,
            minCount: 1,
            maxCount: 3,
            criteria: ['Fair and specific']
        }),
        section('recommendation', 'Who should try it', 'conclusion', {
            criteria: ['Clear recommendation']
        })
    ],
    custom: () => [
        section('body', 'Section', 'body', {
            repeatable: true,
            minCount: 1,
            maxCount: 6
        })
    ]
};

export const RUBRIC_PRESETS = {
    common: () => [
        {
            key: 'ideas',
            label: 'Ideas and content',
            description: 'The writing answers the task and the point stays clear.',
            maxScore: 5,
            appliesToSections: ['*']
        },
        {
            key: 'organisation',
            label: 'Organisation',
            description: 'Sections are in a sensible order and join together smoothly.',
            maxScore: 5,
            appliesToSections: ['*']
        },
        {
            key: 'voice',
            label: 'Vocabulary and voice',
            description: 'Word choice suits the reader and the purpose.',
            maxScore: 4,
            appliesToSections: ['*']
        },
        {
            key: 'conventions',
            label: 'Grammar and punctuation',
            description: 'Sentences, spelling and punctuation do not confuse the reader.',
            maxScore: 4,
            appliesToSections: ['*']
        }
    ]
};

export const DEFAULT_WORKFLOW = {
    teacherPublishesFeedback: true,
    maxDrafts: 4,
    requireNotebookCheck: true,
    autoSuggestNextStep: true
};

export const DEFAULT_AI_CONSTRAINTS = [
    'Never rewrite the student’s sentences for them.',
    'Never give the answer to a question the student has not attempted.',
    'Praise must point at a specific line, not general encouragement.',
    'Do not treat longer or more complicated sentences as automatically better.'
].join(' ');

export const normalizeWritingType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    return WRITING_TYPES.includes(type) ? type : 'essay';
};

export const presetSections = (writingType) => {
    const type = normalizeWritingType(writingType);
    return (SECTION_PRESETS[type] || SECTION_PRESETS.custom)();
};

export const presetRubric = () => RUBRIC_PRESETS.common();
