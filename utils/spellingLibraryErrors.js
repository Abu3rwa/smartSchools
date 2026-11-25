/**
 * Stable domain errors for spelling-library writes.
 *
 * Every failure the teacher can act on has a code, an HTTP status and the exact
 * English/Arabic message used by the client. Controllers never forward raw
 * Mongoose or MongoDB text for these paths.
 */
export const SPELLING_LIBRARY_ERRORS = Object.freeze({
    AUTH_REQUIRED: {
        status: 401,
        en: 'Sign in again, then retry.',
        ar: 'سجّل الدخول مرة أخرى، ثم أعد المحاولة.'
    },
    SCHOOL_REQUIRED: {
        status: 400,
        en: 'Choose your school, then retry.',
        ar: 'اختر مدرستك، ثم أعد المحاولة.'
    },
    ROLE_FORBIDDEN: {
        status: 403,
        en: 'Your current role cannot do this. Switch to an authorized role or contact your school admin.',
        ar: 'دورك الحالي لا يسمح بهذا الإجراء. انتقل إلى دور مخوّل أو تواصل مع مسؤول المدرسة.'
    },
    SCOPE_FORBIDDEN: {
        status: 403,
        en: 'You can edit only the spelling grades used by students in your classes. Ask your school admin to edit this grade.',
        ar: 'يمكنك تعديل مستويات الإملاء التي يدرسها طلاب صفوفك فقط. اطلب من مسؤول المدرسة تعديل هذا المستوى.'
    },
    CORRECTION_SCOPE: {
        status: 403,
        en: "You cannot correct this student's attempt. Ask a teacher responsible for their class or your school admin.",
        ar: 'لا يمكنك تعديل نتيجة هذه المحاولة. اطلب ذلك من معلم مسؤول عن صف الطالب أو من مسؤول المدرسة.'
    },
    INVALID_REQUEST: {
        status: 400,
        en: 'Check the highlighted fields and submit again.',
        ar: 'راجع الحقول المحددة، ثم أرسل الطلب مرة أخرى.'
    },
    INVALID_ID: {
        status: 400,
        en: 'This link is invalid. Reopen the item from the spelling page.',
        ar: 'هذا الرابط غير صالح. افتح العنصر من صفحة الإملاء مرة أخرى.'
    },
    INVALID_FILTER: {
        status: 400,
        en: 'Choose a valid grade, week and page size, then retry.',
        ar: 'اختر مستوى وأسبوعًا وحجم صفحة صالحًا، ثم أعد المحاولة.'
    },
    INVALID_WORD: {
        status: 400,
        en: 'Enter a word of at most 200 characters that is not only punctuation or symbols.',
        ar: 'أدخل كلمة لا تتجاوز 200 حرف، ولا تتكون من علامات ترقيم أو رموز فقط.'
    },
    INVALID_CATEGORY: {
        status: 400,
        en: 'Enter a category of 1 to 120 characters.',
        ar: 'أدخل فئة يتراوح طولها بين حرف واحد و120 حرفًا.'
    },
    INVALID_DEFINITION: {
        status: 400,
        en: 'Shorten the definition to 2,000 characters or fewer.',
        ar: 'اختصر التعريف إلى 2000 حرف أو أقل.'
    },
    INVALID_POSITION: {
        status: 400,
        en: "Choose a valid week and a position within that week's word list.",
        ar: 'اختر أسبوعًا صالحًا وموضعًا ضمن قائمة كلمات ذلك الأسبوع.'
    },
    INVALID_ORDER: {
        status: 400,
        en: 'Include every word in this week exactly once, then preview the order again.',
        ar: 'أدرج كل كلمة في هذا الأسبوع مرة واحدة فقط، ثم اعرض معاينة الترتيب من جديد.'
    },
    CHANGE_TYPE_REQUIRED: {
        status: 400,
        en: 'Confirm that this is a typo correction. To replace the word, remove it and add a new word instead.',
        ar: 'أكّد أن هذا تصحيح لخطأ كتابي. لاستبدال الكلمة، احذفها من القائمة وأضف كلمة جديدة بدلًا منها.'
    },
    CROSS_GRADE_MOVE: {
        status: 400,
        en: 'Move within this grade. To move to another grade, preview removing this word and adding it there.',
        ar: 'انقل الكلمة داخل هذا المستوى. لنقلها إلى مستوى آخر، اعرض معاينة حذفها من هنا وإضافتها هناك.'
    },
    WORD_NOT_FOUND: {
        status: 404,
        en: 'This word is unavailable. Refresh this week or ask your school admin.',
        ar: 'هذه الكلمة غير متاحة. حدّث قائمة هذا الأسبوع أو تواصل مع مسؤول المدرسة.'
    },
    DUPLICATE_WORD: {
        status: 409,
        en: 'This word already exists in this grade and week. Edit the existing word or choose another week.',
        ar: 'هذه الكلمة موجودة بالفعل في هذا المستوى والأسبوع. عدّل الكلمة الموجودة أو اختر أسبوعًا آخر.'
    },
    EXPECTATION_REQUIRED: {
        status: 400,
        en: 'This page does not have the current save version. Reload the spelling page, review your draft, then save again.',
        ar: 'لا تحتوي هذه الصفحة على إصدار الحفظ الحالي. أعد تحميل صفحة الإملاء وراجع مسودتك، ثم احفظ مرة أخرى.'
    },
    STALE_REVISION: {
        status: 409,
        en: 'Someone else changed this word or attempt. Review their version before saving again.',
        ar: 'عدّل شخص آخر هذه الكلمة أو المحاولة. راجع نسخته قبل الحفظ مرة أخرى.'
    },
    STALE_LIBRARY: {
        status: 409,
        en: "This grade's library changed. Refresh the affected week and preview your changes again.",
        ar: 'تغيّرت مكتبة هذا المستوى. حدّث الأسبوع المعني واعرض معاينة تغييراتك من جديد.'
    },
    OPERATION_REUSED: {
        status: 409,
        en: 'This save identifier was used for different changes. Review your changes and start a new save.',
        ar: 'استُخدم معرّف الحفظ هذا لتغييرات مختلفة. راجع تغييراتك وابدأ عملية حفظ جديدة.'
    },
    ACTIVE_TEST: {
        status: 409,
        en: 'This grade is used in an active spelling test. Finish or end the test, then retry.',
        ar: 'يُستخدم هذا المستوى في اختبار إملاء جارٍ. أكمل الاختبار أو أنهِه، ثم أعد المحاولة.'
    },
    SCHEDULED_TEST: {
        status: 409,
        en: 'This grade is used in a scheduled spelling test. Cancel and reschedule that test before changing the library.',
        ar: 'يُستخدم هذا المستوى في اختبار إملاء مجدول. ألغِ الاختبار وأعد جدولته قبل تعديل المكتبة.'
    },
    PENDING_RETEST_BLOCKED: {
        status: 409,
        en: 'This word has outstanding retests and safe typo propagation is not ready yet. Keep the current spelling and ask your school admin to complete the retest update first.',
        ar: 'لهذه الكلمة إعادة اختبار معلّقة، والتحديث الآمن للتصحيح غير جاهز بعد. احتفظ بالتهجئة الحالية واطلب من مسؤول المدرسة إكمال تحديث إعادة الاختبار أولًا.'
    },
    RETEST_TEXT_COLLISION: {
        status: 409,
        en: 'This correction would combine two pending retest words. Ask your school admin to review them before renaming.',
        ar: 'سيؤدي هذا التصحيح إلى دمج كلمتين في إعادة اختبار معلّقة. اطلب من مسؤول المدرسة مراجعتهما قبل تغيير الكلمة.'
    },
    MIGRATION_REQUIRED: {
        status: 409,
        en: 'Progress protection is not ready for this grade. Ask your school admin to complete the spelling migration before changing its structure.',
        ar: 'حماية تقدّم الطلاب غير جاهزة لهذا المستوى. اطلب من مسؤول المدرسة إكمال ترحيل بيانات الإملاء قبل تغيير ترتيب المكتبة أو محتواها.'
    },
    LIBRARY_INVALID: {
        status: 409,
        en: 'This library has invalid existing words. Ask your school admin to repair the reported rows before testing or editing.',
        ar: 'تحتوي هذه المكتبة على كلمات غير صالحة. اطلب من مسؤول المدرسة إصلاح الصفوف المحددة قبل الاختبار أو التعديل.'
    },
    MIGRATION_BLOCKED: {
        status: 409,
        en: 'Some saved attempts no longer match a curriculum word. Repair the listed identities before this grade can be migrated.',
        ar: 'لم تعد بعض المحاولات المحفوظة تطابق كلمة في المنهج. أصلح الكلمات المحددة قبل ترحيل هذا المستوى.'
    },
    MIGRATION_CONFLICT: {
        status: 409,
        en: 'The migration data changed or another run is active. Finish or resume that run before continuing.',
        ar: 'تغيّرت بيانات الترحيل أو توجد عملية ترحيل أخرى جارية. أكمل تلك العملية أو استأنفها قبل المتابعة.'
    },
    IMPACT_REQUIRED: {
        status: 400,
        en: 'Preview these changes before saving.',
        ar: 'اعرض معاينة هذه التغييرات قبل الحفظ.'
    },
    IMPACT_EXPIRED: {
        status: 409,
        en: 'This preview expired. Preview the changes again before saving.',
        ar: 'انتهت صلاحية هذه المعاينة. اعرض معاينة التغييرات مرة أخرى قبل الحفظ.'
    },
    IMPACT_CHANGED: {
        status: 409,
        en: 'Student progress or test scheduling changed. Preview the impact again before saving.',
        ar: 'تغيّر تقدّم الطلاب أو جدول الاختبارات. اعرض معاينة الأثر مرة أخرى قبل الحفظ.'
    },
    IMPACT_CONFIRMATION_REQUIRED: {
        status: 400,
        en: 'Read the impact summary and confirm it before saving.',
        ar: 'اقرأ ملخص الأثر وأكّد موافقتك عليه قبل الحفظ.'
    },
    IMPACT_TOO_LARGE: {
        status: 413,
        en: 'This change affects more than 2,000 students or 5,000 words in a grade. Ask your school admin for a controlled maintenance update.',
        ar: 'يؤثر هذا التغيير في أكثر من 2000 طالب أو 5000 كلمة في مستوى واحد. اطلب من مسؤول المدرسة إجراء تحديث صيانة منظّم.'
    },
    BULK_TOO_LARGE: {
        status: 413,
        en: 'Select 200 changes or fewer, then preview again.',
        ar: 'اختر 200 تغيير أو أقل، ثم اعرض المعاينة من جديد.'
    },
    FILE_REQUIRED: {
        status: 400,
        en: 'Choose a CSV file, then preview it.',
        ar: 'اختر ملف CSV، ثم اعرض معاينته.'
    },
    FILE_TYPE: {
        status: 400,
        en: 'Upload one CSV file using the sample headers.',
        ar: 'ارفع ملف CSV واحدًا باستخدام عناوين الأعمدة في النموذج.'
    },
    PAYLOAD_TOO_LARGE: {
        status: 413,
        en: 'The request is too large. Use a CSV of at most 1 MiB or a smaller edit request.',
        ar: 'الطلب كبير جدًا. استخدم ملف CSV لا يتجاوز 1 ميبيبايت أو طلب تعديل أصغر.'
    },
    IMPORT_TOO_LARGE: {
        status: 413,
        en: 'Import 5,000 rows or fewer. Split the file without splitting a grade used by replace mode.',
        ar: 'استورد 5000 صف أو أقل. قسّم الملف دون تقسيم بيانات مستوى واحد عند استخدام وضع الاستبدال.'
    },
    AUDIT_TOO_LARGE: {
        status: 413,
        en: 'This import is too large to audit atomically. Use a smaller grade file or ask your school admin for a maintenance update.',
        ar: 'هذا الاستيراد كبير جدًا لتوثيقه بالكامل في عملية واحدة. استخدم ملف مستوى أصغر أو اطلب تحديث صيانة من مسؤول المدرسة.'
    },
    CSV_INVALID: {
        status: 400,
        en: 'Fix the listed CSV row errors, then upload and preview the file again.',
        ar: 'أصلح أخطاء صفوف CSV المحددة، ثم ارفع الملف واعرض معاينته مرة أخرى.'
    },
    IDENTITY_AMBIGUOUS: {
        status: 409,
        en: 'More than one existing word matches this row. Select the existing word to keep, then preview again.',
        ar: 'تتطابق أكثر من كلمة موجودة مع هذا الصف. اختر الكلمة الموجودة التي تريد الاحتفاظ بها، ثم اعرض المعاينة من جديد.'
    },
    IMPORT_NOT_FOUND: {
        status: 404,
        en: 'This import preview is unavailable. Upload the file and preview it again.',
        ar: 'معاينة الاستيراد هذه غير متاحة. ارفع الملف واعرض معاينته مرة أخرى.'
    },
    IMPORT_OWNER: {
        status: 403,
        en: 'Only the admin who created this preview can apply it. Create your own preview to continue.',
        ar: 'يمكن للمسؤول الذي أنشأ هذه المعاينة فقط تطبيقها. أنشئ معاينتك الخاصة للمتابعة.'
    },
    IMPORT_EXPIRED: {
        status: 409,
        en: 'This import preview expired. Upload the file and preview it again.',
        ar: 'انتهت صلاحية معاينة الاستيراد. ارفع الملف واعرض معاينته مرة أخرى.'
    },
    IMPORT_INVALID: {
        status: 400,
        en: 'This import has errors. Fix them and create a new preview before applying it.',
        ar: 'يحتوي هذا الاستيراد على أخطاء. أصلحها وأنشئ معاينة جديدة قبل تطبيقها.'
    },
    IMPORT_MODE_CHANGED: {
        status: 409,
        en: 'The import mode or word mapping changed. Preview that mode and mapping again.',
        ar: 'تغيّر وضع الاستيراد أو ربط الكلمات. اعرض معاينة الوضع والربط الجديدين مرة أخرى.'
    },
    LIBRARY_EMPTY: {
        status: 400,
        en: 'There are no words to export. Add or import a word list first.',
        ar: 'لا توجد كلمات للتصدير. أضف قائمة كلمات أو استوردها أولًا.'
    },
    SESSION_NOT_FOUND: {
        status: 404,
        en: 'This spelling test is unavailable. Reopen it from the spelling page.',
        ar: 'اختبار الإملاء هذا غير متاح. افتحه من صفحة الإملاء مرة أخرى.'
    },
    ATTEMPT_NOT_FOUND: {
        status: 404,
        en: "This attempt is unavailable. Refresh the test's attempt list.",
        ar: 'هذه المحاولة غير متاحة. حدّث قائمة محاولات الاختبار.'
    },
    SKIPPED_ATTEMPT: {
        status: 400,
        en: 'A skipped attempt cannot be marked correct or incorrect. Review another attempt.',
        ar: 'لا يمكن تحديد المحاولة المتخطاة كصحيحة أو خاطئة. راجع محاولة أخرى.'
    },
    SESSION_ABANDONED: {
        status: 409,
        en: 'An abandoned test cannot be corrected. Review a completed test instead.',
        ar: 'لا يمكن تعديل اختبار متروك. راجع اختبارًا مكتملًا بدلًا منه.'
    },
    LEGACY_CORRECTION_UNSAFE: {
        status: 409,
        en: 'This older attempt lacks enough history to safely change its retests. Ask your school admin to review its history, or correct a newer attempt.',
        ar: 'لا يتوفر سجل كافٍ لهذه المحاولة القديمة لتعديل إعادة اختبارها بأمان. اطلب من مسؤول المدرسة مراجعة سجلها أو عدّل محاولة أحدث.'
    },
    CORRECTION_BLOCKED: {
        status: 409,
        en: 'This word is being tested in another active or scheduled test. Finish that test or cancel its schedule before correcting this attempt.',
        ar: 'تُختبر هذه الكلمة في اختبار آخر جارٍ أو مجدول. أكمل ذلك الاختبار أو ألغِ جدولته قبل تعديل هذه المحاولة.'
    },
    CORRECTION_HISTORY_TOO_LARGE: {
        status: 413,
        en: 'This word has too much history for one safe correction. Ask your school admin for a controlled history review.',
        ar: 'لهذه الكلمة سجل طويل لا يمكن تعديله بأمان في عملية واحدة. اطلب من مسؤول المدرسة مراجعة منظّمة للسجل.'
    },
    NOTHING_TO_UNDO: {
        status: 409,
        en: 'There is no current teacher correction to undo. Refresh this attempt.',
        ar: 'لا يوجد تعديل حالي للمعلم يمكن التراجع عنه. حدّث هذه المحاولة.'
    },
    RATE_LIMITED: {
        status: 429,
        en: 'Too many changes were submitted. Wait for the displayed retry time, then try again.',
        ar: 'أُرسلت تغييرات كثيرة. انتظر حتى موعد إعادة المحاولة المعروض، ثم حاول مرة أخرى.'
    },
    READ_FAILED: {
        status: 503,
        en: 'The spelling library could not be loaded. Retry; your saved words have not changed.',
        ar: 'تعذّر تحميل مكتبة الإملاء. أعد المحاولة؛ لم تتغيّر كلماتك المحفوظة.'
    },
    WRITE_FAILED: {
        status: 503,
        en: 'The save could not be confirmed. Keep your draft and retry the same save before making another change.',
        ar: 'تعذّر تأكيد الحفظ. احتفظ بالمسودة وأعد محاولة عملية الحفظ نفسها قبل إجراء تغيير آخر.'
    }
});

const FALLBACK = Object.freeze({
    status: 500,
    en: 'Something went wrong. Retry, then contact your school admin if it continues.',
    ar: 'حدث خطأ ما. أعد المحاولة، ثم تواصل مع مسؤول المدرسة إذا استمر.'
});

export const isSpellingLibraryCode = (code) => Object.hasOwn(SPELLING_LIBRARY_ERRORS, code);

export class SpellingLibraryError extends Error {
    constructor(code, { details = null } = {}) {
        const entry = SPELLING_LIBRARY_ERRORS[code] || FALLBACK;
        super(entry.en);
        this.name = 'SpellingLibraryError';
        this.code = code;
        this.statusCode = entry.status;
        this.expose = true;
        this.messages = { en: entry.en, ar: entry.ar };
        if (details) this.details = details;
    }
}

export const domainError = (code, options) => new SpellingLibraryError(code, options);

export const requestLocale = (req) => {
    const header = String(req?.headers?.['accept-language'] || '').toLowerCase();
    const preferred = String(req?.user?.preferredLanguage || req?.user?.language || '').toLowerCase();
    return header.startsWith('ar') || (!header && preferred.startsWith('ar')) ? 'ar' : 'en';
};

export const errorPayload = (code, locale = 'en', details = null) => {
    const entry = SPELLING_LIBRARY_ERRORS[code] || FALLBACK;
    const payload = {
        success: false,
        code,
        message: entry[locale] || entry.en
    };
    if (details) payload.details = details;
    return payload;
};

/**
 * Route-local error serializer for the spelling router. It runs before the
 * global handler so a domain code always reaches the client with its exact
 * localized sentence, while unknown errors keep the global behaviour.
 */
export const spellingDomainErrorHandler = (err, req, res, next) => {
    if (err?.type === 'entity.too.large' && !isSpellingLibraryCode(err.code)) {
        err = domainError('PAYLOAD_TOO_LARGE');
    }
    if (!err || !isSpellingLibraryCode(err.code)) return next(err);
    const entry = SPELLING_LIBRARY_ERRORS[err.code];
    const locale = requestLocale(req);
    if (err.retryAfter && !res.headersSent) {
        res.setHeader('Retry-After', String(err.retryAfter));
    }
    return res
        .status(entry.status)
        .json(errorPayload(err.code, locale, Array.isArray(err.details) ? err.details : err.details || null));
};
