import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ALLOWED_CV_MIME_TYPES,
  MAX_CV_SIZE_BYTES,
  CreateCvMetadataInput,
  UpdateCvInput,
} from '@bewerber/shared';
import { StorageService } from '../storage/storage.service';
import {
  GoogleDriveFileNotFoundError,
  GoogleDriveService,
} from '../google-drive/google-drive.service';
import { ApplicationsService } from '../applications/applications.service';
import { Cv, CvDocument } from './schemas/cv.schema';

// Local storage keys need a real extension (StorageService/the local
// filesystem backend don't know or care about mimetype) — keyed off the
// mimetype rather than the user-supplied original filename, since that
// can be missing an extension, have the wrong one, or contain characters
// unsafe for a storage key.
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

@Injectable()
export class CvsService {
  constructor(
    @InjectModel(Cv.name) private readonly cvModel: Model<CvDocument>,
    private readonly storage: StorageService,
    private readonly googleDrive: GoogleDriveService,
    private readonly applications: ApplicationsService,
  ) {}

  findAllForUser(userId: string) {
    return this.cvModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOneForUser(userId: string, id: string): Promise<CvDocument> {
    const cv = await this.cvModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!cv) throw new NotFoundException('CV not found');
    return cv;
  }

  async create(
    userId: string,
    metadata: CreateCvMetadataInput,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<CvDocument> {
    if (
      !ALLOWED_CV_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_CV_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Only PDF and DOCX are accepted.`,
      );
    }
    if (file.size > MAX_CV_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${MAX_CV_SIZE_BYTES / (1024 * 1024)} MB limit`,
      );
    }

    let fileKey: string;
    let storageProvider: 'app' | 'google-drive' = 'app';
    if (metadata.useGoogleDrive) {
      if (!(await this.googleDrive.isConnected(userId))) {
        throw new BadRequestException('Google Drive is not connected');
      }
      const uploaded = await this.googleDrive.uploadFile(
        userId,
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      fileKey = uploaded.driveFileId;
      storageProvider = 'google-drive';
    } else {
      const extension = MIME_TYPE_EXTENSIONS[file.mimetype] ?? '';
      fileKey = `cvs/${userId}/${randomUUID()}${extension}`;
      await this.storage.save(fileKey, file.buffer, file.mimetype);
    }

    if (metadata.isDefault) {
      await this.cvModel
        .updateMany(
          { userId: new Types.ObjectId(userId) },
          { isDefault: false },
        )
        .exec();
    }

    return this.cvModel.create({
      userId: new Types.ObjectId(userId),
      label: metadata.label,
      language: metadata.language,
      fileKey,
      storageProvider,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      isDefault: metadata.isDefault,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCvInput,
  ): Promise<CvDocument> {
    const cv = await this.findOneForUser(userId, id);

    if (input.isDefault) {
      await this.cvModel
        .updateMany(
          { userId: cv.userId, _id: { $ne: cv._id } },
          { isDefault: false },
        )
        .exec();
    }
    if (input.label !== undefined) cv.label = input.label;
    if (input.isDefault !== undefined) cv.isDefault = input.isDefault;
    await cv.save();
    return cv;
  }

  async remove(userId: string, id: string): Promise<void> {
    const cv = await this.findOneForUser(userId, id);
    const referencingApplications =
      await this.applications.findReferencingApplications(userId, id);
    if (referencingApplications.length > 0) {
      throw new ConflictException({
        message:
          'This CV is attached to one or more applications. Remove it from the application(s) before deleting.',
        applications: referencingApplications.map((app) => ({
          id: app._id.toString(),
          jobTitle: app.jobTitle,
          company: app.company.name,
        })),
      });
    }
    if (cv.storageProvider === 'google-drive') {
      await this.googleDrive.deleteFile(userId, cv.fileKey);
    } else {
      await this.storage.delete(cv.fileKey);
    }
    await cv.deleteOne();
  }

  // Used only by AdminService.deleteUser's cascade — unlike remove(), never
  // blocks on referencing applications, since everything for this user is
  // being deleted together. Must run before the User document itself is
  // removed: GoogleDriveService.deleteFile looks the user up internally to
  // build an authenticated client, and throws if the user is already gone.
  async removeAllForUser(userId: string): Promise<void> {
    const cvs = await this.cvModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    for (const cv of cvs) {
      if (cv.storageProvider === 'google-drive') {
        await this.googleDrive.deleteFile(userId, cv.fileKey);
      } else {
        await this.storage.delete(cv.fileKey);
      }
    }
    await this.cvModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  async getFile(
    userId: string,
    id: string,
  ): Promise<{
    url: string | null;
    buffer: Buffer | null;
    mimeType: string;
    fileName: string;
  }> {
    const cv = await this.findOneForUser(userId, id);
    if (cv.storageProvider === 'google-drive') {
      // Drive has no presigned-URL equivalent this app uses — always
      // proxy the bytes through the API, same shape the local-storage
      // path already returns (url: null).
      try {
        const buffer = await this.googleDrive.downloadFile(userId, cv.fileKey);
        return {
          url: null,
          buffer,
          mimeType: cv.mimeType,
          fileName: cv.fileName,
        };
      } catch (err) {
        if (err instanceof GoogleDriveFileNotFoundError) {
          // Detected reactively, on this exact open attempt — not checked
          // proactively for every CV on every list load. Persist it so the
          // list shows "unattached" from here on without re-checking.
          cv.unattachedAt = new Date();
          await cv.save();
          throw new NotFoundException(
            'This file is no longer available in Google Drive',
          );
        }
        throw err;
      }
    }
    const url = await this.storage.getDownloadUrl(cv.fileKey);
    const buffer = url ? null : await this.storage.read(cv.fileKey);
    return { url, buffer, mimeType: cv.mimeType, fileName: cv.fileName };
  }

  // "Open" for a Drive-backed CV — a plain <a>/window.open can't carry
  // the Bearer auth getFile's endpoint requires, so the web app calls
  // this (a normal authenticated JSON request) to get the URL first,
  // then opens *that* URL as a separate, unauthenticated navigation.
  // Only meaningful for storageProvider:'google-drive' — local/S3 CVs
  // still go through getFile's blob-fetch-and-open path unchanged.
  async getViewUrl(userId: string, id: string): Promise<string> {
    const cv = await this.findOneForUser(userId, id);
    if (cv.storageProvider !== 'google-drive') {
      throw new BadRequestException('This CV is not stored in Google Drive');
    }
    try {
      return await this.googleDrive.getFileViewUrl(userId, cv.fileKey);
    } catch (err) {
      if (err instanceof GoogleDriveFileNotFoundError) {
        cv.unattachedAt = new Date();
        await cv.save();
        throw new NotFoundException(
          'This file is no longer available in Google Drive',
        );
      }
      throw err;
    }
  }
}
