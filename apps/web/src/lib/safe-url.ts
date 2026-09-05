// Last line of defense before rendering a stored URL as a clickable
// <a href>. The API rejects anything but http(s) at write time (see
// safeUrlSchema in @bewerber/shared), but this field is plain
// `String` at the Mongoose layer with no server-side re-check — so this
// guards against any future write path that bypasses the DTO validation
// (a script, a migration, a bug), rather than trusting stored data is
// always clean. A 'javascript:' or 'data:' URL rendered as href would
// execute in this app's own origin the moment someone clicks it.
export function isSafeHref(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
