function isValidEmail(email) {
  if (!email) return false;
  const e = email.toString().trim().toLowerCase();
  // Simple pragmatic validator (we only need to reject obvious garbage).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * Collect all relevant emails for a student family (no school-wide sharing).
 * Includes father/mother/guardian + studentEmail + student.email if present.
 */
export function collectStudentFamilyEmails(student) {
  const emails = [];

  const father = student?.parentInfo?.fatherEmail;
  const mother = student?.parentInfo?.motherEmail;
  const guardian = student?.parentInfo?.guardianEmail;
  const studentEmail = student?.studentEmail;
  const userEmail = student?.email; // legacy / user email

  for (const e of [father, mother, guardian, studentEmail, userEmail]) {
    if (!isValidEmail(e)) continue;
    emails.push(e.toString().trim().toLowerCase());
  }

  return Array.from(new Set(emails));
}

