export const buildStandardsCsvAiPrompt = ({ subjectName = '', subjectCode = '' } = {}) => {
    const subjectDetails = [
        subjectName ? `Selected subject: ${subjectName}.` : '',
        subjectCode ? `Subject code: ${subjectCode}.` : ''
    ].filter(Boolean).join(' ');

    return `Create a standards import CSV using the attached source data and the attached standards-sample.csv as the exact template.

${subjectDetails}

Requirements:
- Return only valid CSV text, with no Markdown fences, commentary, or extra text.
- Use this exact header row and keep the columns in this exact order:
code,name,description,subjectCode,gradeLevel,category,masteryThreshold,masteryMinQuestions,isActive
- Include one data row for each source standard. Preserve every standard code exactly and do not invent or omit standards.
- Use the selected subject code above for subjectCode when it applies. Do not substitute a subject name for the code.
- Use numeric grade levels (for example, 5), numeric masteryThreshold values from 1 to 100, and positive integer masteryMinQuestions values.
- Use true or false for isActive. Keep category as a plain text category.
- Quote and escape CSV fields correctly, especially descriptions containing commas, quotes, or line breaks. Use doubled quotes inside quoted CSV fields.
- Do not add a title row, blank rows, duplicate codes, or columns not present in the template.
- Compare the result with the attached sample template before returning it.`;
};
