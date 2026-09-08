// Best-effort company-name extraction for the "unmatched" list — emails
// that a real interview/rejection keyword matched but that matchApplication
// couldn't tie to any application (new/renamed company, closed
// application, etc.). Purely a display aid, never used for matching
// itself. LinkedIn's application-status subjects (the only allowlisted
// sender today) overwhelmingly follow "...at <Company>" or "Update from
// <Company>"; falls back to the full subject when neither pattern
// matches, since showing something beats showing nothing.
const AT_COMPANY_PATTERN = /\bat\s+([^|]+)$/i;
const UPDATE_FROM_PATTERN = /^(?:your\s+)?update from (.+)$/i;

export function guessCompanyFromSubject(subject: string): string {
  const atMatch = AT_COMPANY_PATTERN.exec(subject);
  if (atMatch) return atMatch[1].trim();

  const updateMatch = UPDATE_FROM_PATTERN.exec(subject);
  if (updateMatch) return updateMatch[1].trim();

  return subject;
}
