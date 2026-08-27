import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { StorageService } from '../storage.service';

@Injectable()
export class LocalFsStorageProvider extends StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.get<string>('storage.localDir') ?? './uploads');
  }

  private resolveKey(key: string): string {
    // Keys are server-generated (see CvsService), but guard against
    // traversal (`../..`) regardless — never trust a path built from input.
    const full = normalize(join(this.root, key));
    if (!full.startsWith(this.root)) {
      throw new Error(`Refusing to resolve storage key outside root: ${key}`);
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  getDownloadUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
