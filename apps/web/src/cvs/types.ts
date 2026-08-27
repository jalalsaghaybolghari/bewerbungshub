import type { CvLanguage } from '@bewerber/shared';

export interface Cv {
  _id: string;
  label: string;
  language: CvLanguage;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
