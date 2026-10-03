const CATEGORY_LABELS = {
    classwork: { en: 'Classwork', ar: 'العمل الصفي' },
    homework: { en: 'Homework', ar: 'الواجب المنزلي' },
    quiz: { en: 'Quiz', ar: 'اختبار قصير' },
    project: { en: 'Project', ar: 'مشروع' },
    participation: { en: 'Participation', ar: 'المشاركة' },
    test: { en: 'Test', ar: 'اختبار' },
    exam: { en: 'Exam', ar: 'امتحان' },
    midterm: { en: 'Midterm', ar: 'اختبار منتصف الفصل' },
    final: { en: 'Final', ar: 'الاختبار النهائي' },
    oral: { en: 'Oral', ar: 'شفهي' },
    practical: { en: 'Practical', ar: 'عملي' },
    assignment: { en: 'Assignment', ar: 'تكليف' },
    other: { en: 'Other', ar: 'أخرى' }
};

const BEHAVIOR_LABELS = {
    'off-task / not working': 'غير ملتزم بالمهمة / لا يعمل',
    'incomplete classwork': 'العمل الصفي غير مكتمل',
    'active participation & focus': 'المشاركة الفعالة والتركيز',
    'completed classwork on time': 'أكمل العمل الصفي في الوقت المحدد',
    'unprepared / missing materials': 'غير مستعد / المواد ناقصة',
    'disrespectful / refusal to follow rules': 'عدم احترام / رفض اتباع القواعد'
};

export const normalizeEmailLanguage = (language) => language === 'ar' ? 'ar' : 'en';

export const localizeCategory = (category, language = 'en') => {
    const normalizedLanguage = normalizeEmailLanguage(language);
    const key = String(category || '').trim().toLowerCase();
    return CATEGORY_LABELS[key]?.[normalizedLanguage] || String(category || '');
};

export const localizeSubject = (subject, language = 'en') => {
    if (typeof subject === 'string') return subject;
    const normalizedLanguage = normalizeEmailLanguage(language);
    if (normalizedLanguage === 'ar' && (subject?.nameAr || subject?.subjectNameAr)) {
        return subject.nameAr || subject.subjectNameAr;
    }
    return subject?.name || subject?.subjectName || 'Unknown Subject';
};

export const localizeBehaviorRemark = (remark, language = 'en') => {
    if (normalizeEmailLanguage(language) !== 'ar') return remark;
    const match = String(remark || '').match(/^(.*?)\s*\(([+-]?\d+(?:\.\d+)?)\)\s*$/);
    if (!match) return remark;
    const translated = BEHAVIOR_LABELS[match[1].trim().toLowerCase()] || match[1].trim();
    return `${translated} (${match[2]})`;
};

export const localizeRemarks = (remarks, language = 'en') => {
    if (Array.isArray(remarks)) {
        return remarks.map((remark) => localizeBehaviorRemark(remark, language));
    }
    if (typeof remarks !== 'string') return remarks;
    return remarks.split(';').map((remark) => localizeBehaviorRemark(remark.trim(), language)).join('; ');
};
