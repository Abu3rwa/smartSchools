/**
 * Curated support content. Every survey question and every plan task a family
 * sees comes from this file, in both languages, so an Arabic parent never gets
 * an English goal and a teacher never gets an AI paragraph about a child.
 * AI may reorder priorities, but it never writes the words shown to families.
 */

export const SUPPORT_AUDIENCES = ['teacher', 'parent'];

export const CONCERN_KEYS = [
    'effort',
    'homework',
    'participation',
    'understanding',
    'respect',
    'routine',
    'independence',
    'reading',
    'sleep',
    'mood',
    'confidence',
    'responsibility',
];

const question = (id, concern, domain, kind, text, extras = {}) => ({
    id,
    concern,
    domain,
    kind,
    text,
    required: true,
    allowComment: false,
    scaleMax: 4,
    options: null,
    ...extras,
});

export const TEACHER_ROUND_ONE = [
    question('t_effort', 'effort', 'academic', 'scale', {
        en: 'How consistently does this student put in steady effort in your subject?',
        ar: 'ما مدى انتظام جهد هذا الطالب في مادتك؟',
    }, {
        allowComment: true,
        anchors: {
            en: ['Rarely', 'Sometimes', 'Most lessons', 'Every lesson'],
            ar: ['نادرًا', 'أحيانًا', 'معظم الحصص', 'كل حصة'],
        },
    }),
    question('t_work', 'homework', 'academic', 'scale', {
        en: 'How often is classwork or homework completed on time?',
        ar: 'كم مرة يُنجز عمل الصف أو الواجب في وقته؟',
    }, {
        anchors: {
            en: ['Rarely', 'Sometimes', 'Most of the time', 'Always'],
            ar: ['نادرًا', 'أحيانًا', 'معظم الوقت', 'دائمًا'],
        },
    }),
    question('t_help', 'participation', 'academic', 'scale', {
        en: 'How often does this student take part in class or ask for help?',
        ar: 'كم مرة يشارك هذا الطالب في الحصة أو يطلب المساعدة؟',
    }, {
        anchors: {
            en: ['Rarely', 'Sometimes', 'Most lessons', 'Every lesson'],
            ar: ['نادرًا', 'أحيانًا', 'معظم الحصص', 'كل حصة'],
        },
    }),
    question('t_under', 'understanding', 'academic', 'choice', {
        en: 'Where does this student stand with the current material?',
        ar: 'أين يقف هذا الطالب من المادة الحالية؟',
    }, {
        options: {
            en: ['Needs reteaching', 'Developing', 'Secure', 'Ready for extension'],
            ar: ['يحتاج إعادة تعليم', 'في طور النمو', 'متمكن', 'جاهز للتوسع'],
        },
    }),
    question('t_respect', 'respect', 'character', 'choice', {
        en: 'How does this student treat classmates and adults?',
        ar: 'كيف يتعامل هذا الطالب مع زملائه والكبار؟',
    }, {
        options: {
            en: ['Rarely respectful', 'Sometimes', 'Usually', 'Consistently'],
            ar: ['نادرًا ما يكون محترمًا', 'أحيانًا', 'غالبًا', 'باستمرار'],
        },
    }),
    question('t_note', 'general', 'general', 'text', {
        en: 'Anything else the homeroom teacher should understand about this student?',
        ar: 'هل هناك ما ينبغي أن يعرفه معلم الصف عن هذا الطالب؟',
    }, { required: false }),
];

export const PARENT_ROUND_ONE = [
    question('p_routine', 'routine', 'academic', 'scale', {
        en: 'How consistent is the homework routine at home?',
        ar: 'ما مدى انتظام روتين الواجبات في المنزل؟',
    }, {
        anchors: {
            en: ['Not yet', 'Sometimes', 'Most evenings', 'Every evening'],
            ar: ['ليس بعد', 'أحيانًا', 'معظم الأمسيات', 'كل مساء'],
        },
    }),
    question('p_indep', 'independence', 'academic', 'choice', {
        en: 'How much help does your child need to start homework?',
        ar: 'كم من المساعدة يحتاج طفلكم لبدء الواجب؟',
    }, {
        options: {
            en: ['Needs constant help', 'Often needs help', 'Sometimes needs help', 'Works independently'],
            ar: ['يحتاج مساعدة دائمة', 'يحتاج مساعدة غالبًا', 'يحتاج مساعدة أحيانًا', 'يعمل باستقلالية'],
        },
    }),
    question('p_reading', 'reading', 'academic', 'scale', {
        en: 'How often does your child read for pleasure at home?',
        ar: 'كم مرة يقرأ طفلكم للاستمتاع في المنزل؟',
    }, {
        anchors: {
            en: ['Rarely', 'Sometimes', 'Most days', 'Every day'],
            ar: ['نادرًا', 'أحيانًا', 'معظم الأيام', 'كل يوم'],
        },
    }),
    question('p_sleep', 'sleep', 'general', 'scale', {
        en: 'How often does your child get enough sleep on school nights?',
        ar: 'كم مرة يحصل طفلكم على نوم كافٍ في ليالي الدراسة؟',
    }, {
        anchors: {
            en: ['Rarely', 'Sometimes', 'Most nights', 'Every night'],
            ar: ['نادرًا', 'أحيانًا', 'معظم الليالي', 'كل ليلة'],
        },
    }),
    question('p_mood', 'mood', 'general', 'scale', {
        en: 'How has your child felt about school this month?',
        ar: 'كيف كان شعور طفلكم تجاه المدرسة هذا الشهر؟',
    }, {
        anchors: {
            en: ['Very difficult', 'Up and down', 'Mostly good', 'Very good'],
            ar: ['صعب جدًا', 'متقلب', 'جيد غالبًا', 'جيد جدًا'],
        },
    }),
    question('p_confidence', 'confidence', 'character', 'choice', {
        en: 'How does your child respond when work gets hard?',
        ar: 'كيف يتصرف طفلكم عندما يصعب عليه العمل؟',
    }, {
        options: {
            en: ['Gives up quickly', 'Needs encouragement', 'Keeps trying', 'Seeks a challenge'],
            ar: ['يستسلم سريعًا', 'يحتاج تشجيعًا', 'يواصل المحاولة', 'يبحث عن التحدي'],
        },
    }),
    question('p_responsibility', 'responsibility', 'character', 'scale', {
        en: 'How consistently does your child take care of routines and belongings?',
        ar: 'ما مدى انتظام طفلكم في العناية بروتينه وأغراضه؟',
    }, {
        anchors: {
            en: ['Not yet', 'Sometimes', 'Most days', 'Consistently'],
            ar: ['ليس بعد', 'أحيانًا', 'معظم الأيام', 'بانتظام'],
        },
    }),
    question('p_note', 'general', 'general', 'text', {
        en: 'What else should the homeroom teacher understand about your child?',
        ar: 'ما الذي ينبغي أن يعرفه معلم الصف أيضًا عن طفلكم؟',
    }, { required: false }),
];

/**
 * Round two and later ask fewer, sharper questions. Each follow-up is tied to
 * one concern so the answer can be compared with the previous month.
 */
export const FOLLOW_UPS = {
    effort: [question('t_f_effort', 'effort', 'academic', 'choice', {
        en: 'What would help this student the most with effort right now?',
        ar: 'ما أكثر ما يساعد هذا الطالب في الجهد الآن؟',
    }, {
        options: {
            en: ['Clearer steps', 'Shorter tasks', 'More choice', 'Private encouragement'],
            ar: ['خطوات أوضح', 'مهام أقصر', 'خيارات أكثر', 'تشجيع فردي'],
        },
    })],
    homework: [question('t_f_work', 'homework', 'academic', 'choice', {
        en: 'What is most often the reason classwork or homework is unfinished?',
        ar: 'ما السبب الأكثر شيوعًا لعدم إكمال العمل أو الواجب؟',
    }, {
        options: {
            en: ['Not understood', 'No time', 'No routine', 'Usually finished'],
            ar: ['غير مفهوم', 'لا وقت', 'لا يوجد روتين', 'يُنجز غالبًا'],
        },
    })],
    participation: [question('t_f_help', 'participation', 'academic', 'choice', {
        en: 'What stops this student from taking part or asking for help?',
        ar: 'ما الذي يمنع هذا الطالب من المشاركة أو طلب المساعدة؟',
    }, {
        options: {
            en: ['Confidence', 'Language', 'Attention', 'Takes part well'],
            ar: ['الثقة', 'اللغة', 'الانتباه', 'يشارك جيدًا'],
        },
    })],
    understanding: [question('t_f_under', 'understanding', 'academic', 'choice', {
        en: 'Which step of the lesson is hardest for this student?',
        ar: 'أي خطوة في الحصة هي الأصعب لهذا الطالب؟',
    }, {
        options: {
            en: ['Starting', 'Following steps', 'Practising alone', 'Explaining the idea'],
            ar: ['البدء', 'متابعة الخطوات', 'التدرب منفردًا', 'شرح الفكرة'],
        },
    })],
    respect: [question('t_f_respect', 'respect', 'character', 'choice', {
        en: 'In which moment is respect hardest for this student?',
        ar: 'في أي موقف يكون الاحترام أصعب لهذا الطالب؟',
    }, {
        options: {
            en: ['Group work', 'Losing a game', 'Being corrected', 'Unstructured time'],
            ar: ['العمل الجماعي', 'الخسارة في لعبة', 'التصحيح', 'الوقت غير المنظم'],
        },
    })],
    routine: [question('p_f_routine', 'routine', 'academic', 'choice', {
        en: 'What gets in the way of the homework routine at home?',
        ar: 'ما الذي يعيق روتين الواجبات في المنزل؟',
    }, {
        options: {
            en: ['Busy evenings', 'No set place', 'Screens', 'Routine works well'],
            ar: ['أمسيات مزدحمة', 'لا مكان محدد', 'الشاشات', 'الروتين جيد'],
        },
    })],
    independence: [question('p_f_indep', 'independence', 'academic', 'choice', {
        en: 'What kind of help does your child still need to work alone?',
        ar: 'أي نوع من المساعدة لا يزال طفلكم يحتاجه ليعمل باستقلالية؟',
    }, {
        options: {
            en: ['Reading instructions', 'Getting started', 'Staying on task', 'Checking the work'],
            ar: ['قراءة التعليمات', 'البدء', 'البقاء في المهمة', 'مراجعة العمل'],
        },
    })],
    reading: [question('p_f_reading', 'reading', 'academic', 'choice', {
        en: 'What would make reading at home easier?',
        ar: 'ما الذي يسهّل القراءة في المنزل؟',
    }, {
        options: {
            en: ['Shorter books', 'A shared reading time', 'Books at their level', 'Reading together'],
            ar: ['كتب أقصر', 'وقت قراءة مشترك', 'كتب في مستواهم', 'القراءة معًا'],
        },
    })],
    sleep: [question('p_f_sleep', 'sleep', 'general', 'choice', {
        en: 'What makes bedtime difficult on school nights?',
        ar: 'ما الذي يصعّب وقت النوم في ليالي الدراسة؟',
    }, {
        options: {
            en: ['Homework late', 'Screens', 'Siblings', 'Bedtime is fine'],
            ar: ['واجب متأخر', 'الشاشات', 'الأشقاء', 'وقت النوم مناسب'],
        },
    })],
    mood: [question('p_f_mood', 'mood', 'general', 'choice', {
        en: 'When is your child most at ease about school?',
        ar: 'متى يكون طفلكم أكثر ارتياحًا تجاه المدرسة؟',
    }, {
        options: {
            en: ['In class', 'With friends', 'At home', 'Rarely at ease'],
            ar: ['في الحصة', 'مع الأصدقاء', 'في المنزل', 'نادرًا ما يرتاح'],
        },
    })],
    confidence: [question('p_f_conf', 'confidence', 'character', 'choice', {
        en: 'What helps your child keep trying when work is hard?',
        ar: 'ما الذي يساعد طفلكم على مواصلة المحاولة عند صعوبة العمل؟',
    }, {
        options: {
            en: ['Encouragement', 'Seeing an example', 'A short break', 'Working with someone'],
            ar: ['التشجيع', 'رؤية مثال', 'استراحة قصيرة', 'العمل مع شخص'],
        },
    })],
    responsibility: [question('p_f_resp', 'responsibility', 'character', 'choice', {
        en: 'Which routine is hardest for your child to keep?',
        ar: 'أي روتين يصعب على طفلكم الالتزام به؟',
    }, {
        options: {
            en: ['Packing the bag', 'Handing in work', 'Tidying up', 'Keeping a schedule'],
            ar: ['تجهيز الحقيبة', 'تسليم العمل', 'الترتيب', 'الالتزام بالجدول'],
        },
    })],
};

const goalCopy = (concern, domain, en, ar, descriptionEn, descriptionAr, successEn, successAr, home, classRoom) => ({
    concern,
    domain,
    title: { en, ar },
    description: { en: descriptionEn, ar: descriptionAr },
    successLook: { en: successEn, ar: successAr },
    homeTasks: home.map(([id, titleEn, titleAr, noteEn, noteAr]) => ({
        id,
        title: { en: titleEn, ar: titleAr },
        note: { en: noteEn, ar: noteAr },
    })),
    classTasks: classRoom.map(([id, titleEn, titleAr, noteEn, noteAr]) => ({
        id,
        title: { en: titleEn, ar: titleAr },
        note: { en: noteEn, ar: noteAr },
    })),
});

export const PLAN_TEMPLATES = {
    effort: goalCopy(
        'effort', 'academic',
        'Steady effort in every lesson', 'جهد منتظم في كل حصة',
        'Break work into small steps and value the attempt, not only the result.',
        'تقسيم العمل إلى خطوات صغيرة وتقدير المحاولة لا النتيجة وحدها.',
        'Starts work without a reminder on most days.',
        'يبدأ العمل دون تذكير في معظم الأيام.',
        [
            ['e_h1', 'Agree on a 20-minute homework block', 'الاتفاق على ٢٠ دقيقة للواجب', 'Same time and place each evening.', 'الوقت والمكان نفسهما كل مساء.'],
            ['e_h2', 'Ask what was finished, then praise the effort', 'السؤال عما أُنجز ثم الثناء على الجهد', 'One specific sentence is enough.', 'جملة محددة واحدة تكفي.'],
        ],
        [
            ['e_c1', 'Give the first step in writing', 'كتابة الخطوة الأولى', 'Check it is understood before starting.', 'التأكد من فهمها قبل البدء.'],
            ['e_c2', 'Notice effort privately each lesson', 'ملاحظة الجهد فرديًا كل حصة', 'One short, specific comment.', 'تعليق قصير ومحدد.'],
        ],
    ),
    homework: goalCopy(
        'homework', 'academic',
        'Work finished and handed in on time', 'إنجاز العمل وتسليمه في وقته',
        'Make the task visible and the hand-in moment predictable.',
        'جعل المهمة واضحة ووقت التسليم متوقعًا.',
        'Hands in work on time at least four days out of five.',
        'يسلّم العمل في وقته في أربعة أيام من أصل خمسة على الأقل.',
        [
            ['h_h1', 'Pack the bag and check the task list together', 'تجهيز الحقيبة ومراجعة قائمة المهام معًا', 'Before dinner, not at bedtime.', 'قبل العشاء لا عند النوم.'],
            ['h_h2', 'Keep one visible place for school work', 'تخصيص مكان ظاهر للعمل المدرسي', 'The same spot every evening.', 'المكان نفسه كل مساء.'],
        ],
        [
            ['h_c1', 'Write the task on the board and check it is copied', 'كتابة المهمة على السبورة والتأكد من نسخها', 'Ask two students to read it back.', 'طلب قراءتها من طالبين.'],
            ['h_c2', 'Collect work at the start of the lesson', 'جمع العمل في بداية الحصة', 'A fixed routine settles the class.', 'روتين ثابت يهدئ الصف.'],
        ],
    ),
    participation: goalCopy(
        'participation', 'academic',
        'Taking part and asking for help', 'المشاركة وطلب المساعدة',
        'Lower the cost of speaking by giving a small, predictable role.',
        'تسهيل الحديث بإعطاء دور صغير ومتوقع.',
        'Speaks or asks a question at least once in most lessons.',
        'يتحدث أو يسأل مرة واحدة على الأقل في معظم الحصص.',
        [
            ['p_h1', 'Ask one question about the lesson each evening', 'سؤال واحد عن الحصة كل مساء', 'Listen without correcting every detail.', 'الإنصات دون تصحيح كل تفصيل.'],
            ['p_h2', 'Rehearse a question before class', 'التدرب على سؤال قبل الحصة', 'A question they can ask the teacher.', 'سؤال يمكنهم طرحه على المعلم.'],
        ],
        [
            ['p_c1', 'Give a small speaking role early in the lesson', 'إعطاء دور حديث صغير في بداية الحصة', 'Pair share before whole-class sharing.', 'مشاركة ثنائية قبل مشاركة الصف.'],
            ['p_c2', 'Check in privately before independent work', 'الاطمئنان فرديًا قبل العمل المستقل', 'Ask what the first step is.', 'السؤال عن الخطوة الأولى.'],
        ],
    ),
    understanding: goalCopy(
        'understanding', 'academic',
        'Understanding the lesson step by step', 'فهم الحصة خطوة بخطوة',
        'Check understanding at each step instead of at the end.',
        'التحقق من الفهم في كل خطوة لا في النهاية فقط.',
        'Can explain the first step in their own words.',
        'يستطيع شرح الخطوة الأولى بكلماته.',
        [
            ['u_h1', 'Review one worked example together', 'مراجعة مثال محلول واحد معًا', 'Ask your child to explain it back.', 'طلب شرحه من الطفل.'],
            ['u_h2', 'Keep a small example book at home', 'الاحتفاظ بكراسة أمثلة صغيرة في المنزل', 'One example per lesson.', 'مثال واحد لكل حصة.'],
        ],
        [
            ['u_c1', 'Provide a worked example and check the first question', 'تقديم مثال محلول والتحقق من السؤال الأول', 'Before releasing the whole task.', 'قبل إطلاق المهمة كاملة.'],
            ['u_c2', 'Use one quick check for understanding', 'استخدام تحقق سريع من الفهم', 'Thumbs, mini-whiteboards, or one question.', 'إشارة بالإبهام أو لوح صغير أو سؤال واحد.'],
        ],
    ),
    respect: goalCopy(
        'respect', 'character',
        'Respectful words and choices', 'كلمات وخيارات محترمة',
        'Name the expected behaviour and notice it when it happens.',
        'تسمية السلوك المتوقع وملاحظته عند حدوثه.',
        'Handles disagreement without hurtful words.',
        'يتعامل مع الخلاف دون كلمات جارحة.',
        [
            ['r_h1', 'Name and praise respectful choices when they happen', 'تسمية الخيارات المحترمة والثناء عليها عند حدوثها', 'Be specific about what was respectful.', 'تحديد ما كان محترمًا بالضبط.'],
            ['r_h2', 'Agree on one calm-down step for frustration', 'الاتفاق على خطوة واحدة للتهدئة عند الانفعال', 'A short walk or a glass of water.', 'مشي قصير أو كوب ماء.'],
        ],
        [
            ['r_c1', 'Seat near positive peers and reinforce expectations quietly', 'الجلوس قرب أقران إيجابيين وتعزيز التوقعات بهدوء', 'A private reminder, not a public correction.', 'تذكير فردي لا تصحيح علني.'],
            ['r_c2', 'Use a consistent script for redirection', 'استخدام عبارة ثابتة لإعادة التوجيه', 'Same words every time.', 'الكلمات نفسها في كل مرة.'],
        ],
    ),
    routine: goalCopy(
        'routine', 'academic',
        'A calm home routine for school work', 'روتين منزلي هادئ للعمل المدرسي',
        'A predictable time and place does more than reminders.',
        'الوقت والمكان المتوقعان أنفع من التذكير المتكرر.',
        'Homework starts at the agreed time on most evenings.',
        'يبدأ الواجب في الوقت المتفق عليه في معظم الأمسيات.',
        [
            ['rt_h1', 'Choose one homework time and place together', 'اختيار وقت ومكان واحد للواجب معًا', 'Write it where the family can see it.', 'كتابته في مكان تراه الأسرة.'],
            ['rt_h2', 'Put screens away during the homework block', 'إبعاد الشاشات أثناء وقت الواجب', 'The same rule for everyone.', 'القاعدة نفسها للجميع.'],
        ],
        [
            ['rt_c1', 'Keep the homework routine on the board', 'إبقاء روتين الواجب على السبورة', 'Same order every day.', 'الترتيب نفسه كل يوم.'],
            ['rt_c2', 'Remind the class of the hand-in day', 'تذكير الصف بيوم التسليم', 'One clear reminder, not several.', 'تذكير واضح واحد لا عدة تذكيرات.'],
        ],
    ),
    independence: goalCopy(
        'independence', 'academic',
        'Starting work independently', 'بدء العمل باستقلالية',
        'Move help from doing the work to checking the first step.',
        'نقل المساعدة من إنجاز العمل إلى التحقق من الخطوة الأولى.',
        'Starts the first question without adult help.',
        'يبدأ السؤال الأول دون مساعدة بالغة.',
        [
            ['i_h1', 'Read the instructions together, then step back', 'قراءة التعليمات معًا ثم الابتعاد', 'Stay nearby without taking over.', 'البقاء قريبًا دون تولي المهمة.'],
            ['i_h2', 'Ask “what is the first step?” instead of explaining', 'السؤال عن الخطوة الأولى بدل الشرح', 'Let your child answer first.', 'ترك الإجابة للطفل أولًا.'],
        ],
        [
            ['i_c1', 'Check the first step, then release', 'التحقق من الخطوة الأولى ثم المتابعة', 'Short contact, early in the task.', 'تواصل قصير في بداية المهمة.'],
            ['i_c2', 'Offer a checklist instead of repeated help', 'تقديم قائمة تحقق بدل المساعدة المتكررة', 'Three steps at most.', 'ثلاث خطوات كحد أقصى.'],
        ],
    ),
    reading: goalCopy(
        'reading', 'academic',
        'A short, regular reading habit', 'عادة قراءة قصيرة ومنتظمة',
        'Fifteen minutes that happen beats an hour that does not.',
        'خمس عشرة دقيقة تتحقق أنفع من ساعة لا تحدث.',
        'Reads for pleasure several times a week.',
        'يقرأ للاستمتاع عدة مرات في الأسبوع.',
        [
            ['rd_h1', 'Read together for fifteen minutes', 'القراءة معًا خمس عشرة دقيقة', 'Let your child choose the book.', 'ترك اختيار الكتاب للطفل.'],
            ['rd_h2', 'Keep books where they are easy to reach', 'إبقاء الكتب في مكان يسهل الوصول إليه', 'A basket in the living room works.', 'سلة في غرفة الجلوس تكفي.'],
        ],
        [
            ['rd_c1', 'Offer a short reading choice each week', 'تقديم خيار قراءة قصير كل أسبوع', 'Two books at the right level.', 'كتابان في المستوى المناسب.'],
            ['rd_c2', 'Protect ten minutes of reading time in class', 'حماية عشر دقائق للقراءة في الحصة', 'Same slot each week.', 'الموعد نفسه كل أسبوع.'],
        ],
    ),
    sleep: goalCopy(
        'sleep', 'character',
        'Calmer school nights', 'ليالٍ دراسية أهدأ',
        'A steady bedtime is the strongest support for attention.',
        'وقت النوم المنتظم أقوى دعم للانتباه.',
        'Gets enough sleep on most school nights.',
        'يحصل على نوم كافٍ في معظم ليالي الدراسة.',
        [
            ['s_h1', 'Set one bedtime for school nights', 'تحديد وقت نوم واحد لليالي الدراسة', 'Keep it within half an hour all week.', 'الالتزام به بفارق نصف ساعة طوال الأسبوع.'],
            ['s_h2', 'Finish screens thirty minutes before bed', 'إنهاء الشاشات قبل النوم بثلاثين دقيقة', 'Charge devices outside the bedroom.', 'شحن الأجهزة خارج غرفة النوم.'],
        ],
        [
            ['s_c1', 'Keep homework load predictable', 'إبقاء حجم الواجب متوقعًا', 'Avoid last-minute additions.', 'تجنب الإضافات في اللحظة الأخيرة.'],
            ['s_c2', 'Check in after a tired morning', 'الاطمئنان بعد صباح متعب', 'A brief, private conversation.', 'محادثة قصيرة وفردية.'],
        ],
    ),
    mood: goalCopy(
        'mood', 'character',
        'Feeling settled about school', 'الاطمئنان تجاه المدرسة',
        'Notice the good moments and keep the door open for worry.',
        'ملاحظة اللحظات الجيدة وإبقاء الباب مفتوحًا للقلق.',
        'Talks about school without distress most days.',
        'يتحدث عن المدرسة دون ضيق في معظم الأيام.',
        [
            ['m_h1', 'Ask about one good moment each day', 'السؤال عن لحظة جيدة كل يوم', 'Listen before giving advice.', 'الإنصات قبل تقديم النصيحة.'],
            ['m_h2', 'Keep a predictable morning goodbye', 'الحفاظ على وداع صباحي متوقع', 'Short and warm.', 'قصير ودافئ.'],
        ],
        [
            ['m_c1', 'Greet the student by name at the door', 'تحية الطالب باسمه عند الباب', 'A steady, friendly start.', 'بداية ثابتة وودية.'],
            ['m_c2', 'Give one early success in the lesson', 'إتاحة نجاح مبكر في الحصة', 'A question the student can answer.', 'سؤال يستطيع الطالب الإجابة عنه.'],
        ],
    ),
    confidence: goalCopy(
        'confidence', 'character',
        'Trying again when work is hard', 'المحاولة مجددًا عند صعوبة العمل',
        'Praise the attempt and show that struggle is part of learning.',
        'الثناء على المحاولة وإظهار أن الصعوبة جزء من التعلم.',
        'Tries a second time before asking for help.',
        'يحاول مرة ثانية قبل طلب المساعدة.',
        [
            ['c_h1', 'Praise the attempt before the answer', 'الثناء على المحاولة قبل الإجابة', 'Say what was tried.', 'ذكر ما تمت تجربته.'],
            ['c_h2', 'Share a small mistake of your own', 'مشاركة خطأ صغير من جانبكم', 'Show that mistakes are normal.', 'إظهار أن الأخطاء طبيعية.'],
        ],
        [
            ['c_c1', 'Give a task the student can succeed at first', 'تقديم مهمة يمكن للطالب إنجازها أولًا', 'Build from a known step.', 'البناء على خطوة معروفة.'],
            ['c_c2', 'Use a private signal for “I am stuck”', 'استخدام إشارة فردية تعني التوقف', 'Avoids public embarrassment.', 'تجنب الإحراج العلني.'],
        ],
    ),
    responsibility: goalCopy(
        'responsibility', 'character',
        'Owning routines and belongings', 'الالتزام بالروتين والأغراض',
        'One routine at a time, practised until it is automatic.',
        'روتين واحد في كل مرة يتدرب عليه حتى يصبح تلقائيًا.',
        'Completes the chosen routine without reminders most days.',
        'ينجز الروتين المختار دون تذكير في معظم الأيام.',
        [
            ['res_h1', 'Choose one routine to practise this month', 'اختيار روتين واحد للتدريب هذا الشهر', 'Packing the bag is a good start.', 'تجهيز الحقيبة بداية جيدة.'],
            ['res_h2', 'Use a simple checklist by the door', 'استخدام قائمة تحقق بسيطة عند الباب', 'Three items at most.', 'ثلاثة عناصر كحد أقصى.'],
        ],
        [
            ['res_c1', 'Allow natural consequences for forgotten items', 'ترك العواقب الطبيعية للأغراض المنسية', 'Support without rescuing every time.', 'الدعم دون الإنقاذ في كل مرة.'],
            ['res_c2', 'Recognise the routine when it is kept', 'تقدير الروتين عند الالتزام به', 'Quiet, specific recognition.', 'تقدير هادئ ومحدد.'],
        ],
    ),
};

const withLanguage = (item, language = 'en') => {
    const lang = language === 'ar' ? 'ar' : 'en';
    return item[lang] || item.en || '';
};

export const localize = withLanguage;

/** Questions for a first survey: fixed, short, identical for every teacher. */
export const roundOneQuestions = (audience) => (
    audience === 'parent' ? PARENT_ROUND_ONE : TEACHER_ROUND_ONE
);

/**
 * Questions for round two and later: follow up on the weakest concerns first,
 * then keep a couple of core questions so month-to-month trends stay comparable.
 */
export const adaptiveQuestions = (audience, concerns = []) => {
    const cap = audience === 'parent' ? 8 : 6;
    const bank = audience === 'parent' ? PARENT_ROUND_ONE : TEACHER_ROUND_ONE;
    const picked = [];
    const seen = new Set();

    const add = (item) => {
        if (!item || seen.has(item.id) || picked.length >= cap) return;
        seen.add(item.id);
        picked.push(item);
    };

    const ranked = [...new Set(concerns.filter((key) => FOLLOW_UPS[key] || bank.some((item) => item.concern === key)))];
    for (const concern of ranked) {
        const [followUp] = FOLLOW_UPS[concern] || [];
        if (followUp) add(followUp);
    }
    for (const item of bank) {
        if (item.required) add(item);
    }
    return picked;
};

/** Turn a library question into the snapshot stored on the survey. */
export const toSurveyQuestion = (item, language = 'en') => {
    const lang = language === 'ar' ? 'ar' : 'en';
    return {
        id: item.id,
        key: item.concern,
        domain: item.domain,
        prompt: item.text.en,
        promptAr: item.text.ar || '',
        kind: item.kind,
        scaleMax: item.scaleMax || 4,
        options: item.options?.en || [],
        optionsAr: item.options?.ar || [],
        anchors: item.anchors?.en || [],
        anchorsAr: item.anchors?.ar || [],
        required: item.required !== false,
        allowComment: item.allowComment === true,
    };
};

/** Build the plan body from concern keys. Every string stays bilingual. */
export const buildGoalFromTemplate = (concern, suffix = '') => {
    const template = PLAN_TEMPLATES[concern];
    if (!template) return null;
    const id = `goal_${concern}${suffix}`;
    return {
        id,
        domain: template.domain,
        title: template.title.en,
        titleAr: template.title.ar,
        description: template.description.en,
        descriptionAr: template.description.ar,
        successLook: template.successLook.en,
        successLookAr: template.successLook.ar,
        homeTasks: template.homeTasks.map((task) => ({
            id: `${task.id}${suffix}`,
            title: task.title.en,
            titleAr: task.title.ar,
            note: task.note.en,
            noteAr: task.note.ar,
        })),
        classTasks: template.classTasks.map((task) => ({
            id: `${task.id}${suffix}`,
            title: task.title.en,
            titleAr: task.title.ar,
            note: task.note.en,
            noteAr: task.note.ar,
        })),
    };
};

export const templateText = (concern, field) => {
    const template = PLAN_TEMPLATES[concern];
    if (!template) return null;
    return template[field] || null;
};
