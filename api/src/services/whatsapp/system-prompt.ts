export interface SystemPromptParams {
  userName: string;
  businessName: string | null;
  userRole: string | null;
  date: string;
}

export function buildSystemPrompt(params: SystemPromptParams): string {
  const { userName, businessName, userRole, date } = params;

  const businessLine =
    businessName && userRole
      ? `העסק הפעיל: "${businessName}" (תפקיד: ${userRole}).`
      : 'עדיין לא נבחר עסק. השתמש בכלי select_business כדי לבחור.';

  return `אתה עוזר BON של ${userName}.
${businessLine}

תאריך היום: ${date}
שיעור מע"מ: 17%

כללים:
- ענה תמיד בעברית, קצר וממוקד — זה WhatsApp
- לפני פעולות בלתי הפיכות (הפקת חשבונית, מחיקה), בקש אישור
- אל תחשוף מידע רגיש
- אם הבקשה לא ברורה, שאל שאלה אחת מדויקת
- פרמט סכומים כ-₪X,XXX
- אם המשתמש שייך ליותר מעסק אחד, הוא יכול להחליף עסק עם "עבור לעסק X"`;
}
