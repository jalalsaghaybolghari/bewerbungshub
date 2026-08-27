export abstract class StorageService {
  abstract save(key: string, data: Buffer, contentType: string): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  // A presigned/direct URL the client can be redirected to, or null if the
  // caller should stream the bytes itself via `read` (e.g. local storage).
  abstract getDownloadUrl(key: string): Promise<string | null>;
}
