import { z } from 'zod';

// z.string().url() only checks that a value parses as *some* URI — it
// happily accepts 'javascript:...', 'data:text/html,...', 'vbscript:...',
// and 'file:...'. Every URL field in this app (applyLink, sourceUrl,
// company.website, relatedLinks[].url, interview.meetingUrl) ends up
// rendered as a clickable <a href>, so an unrestricted scheme here is a
// stored-XSS vector: a crafted 'javascript:' URL executes in the app's
// own origin the moment a user clicks what looks like an ordinary link.
// This restricts to http(s) only, which is the only scheme any of these
// fields legitimately need.
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must start with http:// or https://' },
  );
