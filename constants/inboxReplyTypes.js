/** The reply types the assistant can write. Ids are fixed: drafts store them. */
export const INBOX_REPLY_TYPES = [
    { id: 'acknowledge_received', group: 'acknowledge', labelEn: 'Got it', labelAr: 'تم الاستلام', instruction: 'Confirm the message was received and understood.' },
    { id: 'thank_you', group: 'acknowledge', labelEn: 'Thank you', labelAr: 'شكرًا', instruction: 'Thank the sender sincerely for what they did or sent.' },
    { id: 'noted_will_review', group: 'acknowledge', labelEn: 'Noted, will review', labelAr: 'اطّلعت وسأراجع', instruction: 'Say it is noted and you will review it; promise no outcome.' },
    { id: 'will_do_by_date', group: 'commit', labelEn: 'I will do it by [date]', labelAr: 'سأنجزه بحلول [التاريخ]', instruction: 'Commit to doing the requested thing by a date; use [[DATE]] if the teacher did not give one.' },
    { id: 'done_completed', group: 'commit', labelEn: 'Done', labelAr: 'تم الإنجاز', instruction: 'Say the requested task is completed.' },
    { id: 'will_send_shortly', group: 'commit', labelEn: 'Will send shortly', labelAr: 'سأرسله قريبًا', instruction: 'Say the requested item will be sent shortly; do not attach anything.' },
    { id: 'confirm_attendance', group: 'commit', labelEn: 'I will attend', labelAr: 'سأحضر', instruction: 'Confirm attendance at the event or meeting named in the email.' },
    { id: 'confirm_meeting_time', group: 'commit', labelEn: 'Confirm the meeting time', labelAr: 'أؤكد موعد الاجتماع', instruction: 'Confirm the meeting time proposed in the email.' },
    { id: 'ask_more_time', group: 'time', labelEn: 'Ask for more time', labelAr: 'طلب مزيد من الوقت', instruction: 'Politely ask for more time; propose a date only if the teacher gave one, otherwise [[DATE]].' },
    { id: 'apologize_delay', group: 'time', labelEn: 'Sorry for the delay', labelAr: 'اعتذار عن التأخير', instruction: 'Apologize briefly for answering late, then answer or say when you will.' },
    { id: 'propose_other_time', group: 'time', labelEn: 'Propose another time', labelAr: 'اقتراح وقت آخر', instruction: 'Propose a different time for the meeting or deadline; use [[DATE]].' },
    { id: 'cannot_attend', group: 'time', labelEn: 'Cannot attend', labelAr: 'لا أستطيع الحضور', instruction: 'Politely say you cannot attend; offer to catch up afterwards.' },
    { id: 'ask_clarification', group: 'ask', labelEn: 'Ask a clarifying question', labelAr: 'سؤال توضيحي', instruction: 'Ask one short question about the unclear part of the email.' },
    { id: 'ask_missing_info', group: 'ask', labelEn: 'Ask for missing information', labelAr: 'طلب معلومات ناقصة', instruction: 'Ask for the file, form or information that the email leaves out.' },
    { id: 'request_approval', group: 'ask', labelEn: 'Request approval', labelAr: 'طلب موافقة', instruction: 'Ask for permission or approval for the thing the teacher wants to do.' },
    { id: 'decline_politely', group: 'say_no', labelEn: 'Decline politely', labelAr: 'رفض بأدب', instruction: 'Decline kindly without blaming anyone.' },
    { id: 'cannot_do_with_reason', group: 'say_no', labelEn: 'Cannot do it, with a reason', labelAr: 'لا أستطيع مع ذكر السبب', instruction: 'Say you cannot do it and give the reason the teacher supplied; otherwise [[DETAILS]].' },
    { id: 'suggest_alternative', group: 'say_no', labelEn: 'Suggest an alternative', labelAr: 'اقتراح بديل', instruction: 'Decline the request as written and propose a different option.' },
    { id: 'status_update', group: 'inform', labelEn: 'Status update', labelAr: 'تحديث عن الحالة', instruction: "Give a short progress update using only facts from the thread or the teacher's note." },
    { id: 'answer_question', group: 'inform', labelEn: 'Answer the question', labelAr: 'إجابة عن السؤال', instruction: "Answer the question asked, using only facts from the thread or the teacher's note." },
    { id: 'share_short_report', group: 'inform', labelEn: 'Short report', labelAr: 'تقرير قصير', instruction: "Write a short factual report from the teacher's note." },
    { id: 'congratulate_appreciate', group: 'inform', labelEn: 'Congratulate or appreciate', labelAr: 'تهنئة أو تقدير', instruction: 'Congratulate or appreciate the sender for what the email describes.' },
    { id: 'forward_to_right_person', group: 'route', labelEn: 'Point to the right person', labelAr: 'إحالة للشخص المناسب', instruction: 'Say this should go to someone else; never invent a name, use [[NAME]].' },
    { id: 'ask_to_follow_up', group: 'route', labelEn: 'Ask someone to follow up', labelAr: 'طلب متابعة', instruction: 'Ask the sender or another person to follow up on a named item.' },
    { id: 'polite_reminder', group: 'chase', labelEn: 'Polite reminder', labelAr: 'تذكير لطيف', instruction: 'Remind the sender kindly about an open request.' },
    { id: 'second_reminder', group: 'chase', labelEn: 'Second reminder', labelAr: 'تذكير ثانٍ', instruction: 'Firm but polite second reminder.' },
    { id: 'close_the_loop', group: 'chase', labelEn: 'Close the loop', labelAr: 'إغلاق الموضوع', instruction: 'Confirm the matter is settled and no further action is needed.' },
    { id: 'custom', group: 'custom', labelEn: 'My own instruction', labelAr: 'تعليماتي الخاصة', instruction: "Follow the teacher's own instruction text exactly; it comes from the teacher, not from the email." }
];

export const INBOX_REPLY_TYPE_IDS = INBOX_REPLY_TYPES.map((type) => type.id);

export const findInboxReplyType = (id) =>
    INBOX_REPLY_TYPES.find((type) => type.id === id) || null;

export const isInboxReplyTypeId = (id) => Boolean(findInboxReplyType(id));
