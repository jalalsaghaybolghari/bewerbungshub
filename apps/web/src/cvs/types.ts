import type { CvLanguage } from '@bewerber/shared';

export interface Cv {
  _id: string;
  label: string;
  language: CvLanguage;
  fileKey: string;
  storageProvider: 'app' | 'google-drive';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isDefault: boolean;
  // Set once opening this CV finds the underlying Google Drive file is
  // gone (e.g. deleted directly in Drive, outside the app). Undefined
  // means still attached — never checked proactively, only on open.
  unattachedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleDriveStatus {
  connected: boolean;
  connectedAt?: string;
}
