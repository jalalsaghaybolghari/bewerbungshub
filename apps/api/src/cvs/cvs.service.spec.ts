import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import type { CreateCvMetadataInput } from '@bewerber/shared';
import { CvsService } from './cvs.service';
import { Cv, CvDocument, CvSchema } from './schemas/cv.schema';
import {
  GoogleDriveFileNotFoundError,
  GoogleDriveService,
} from '../google-drive/google-drive.service';
import { ApplicationsService } from '../applications/applications.service';

// First spec file for CvsService — real Mongoose documents via
// mongodb-memory-server (same precedent as applications.service.spec.ts),
// since getFile()'s unattached-detection path calls cv.save() on a real
// document, not something worth hand-mocking. StorageService and
// GoogleDriveService are the actual external boundaries, so those are
// mocked.
jest.setTimeout(60000);

function makeStorageMock() {
  return {
    save: jest.fn<Promise<void>, [string, Buffer, string]>(),
    read: jest.fn<Promise<Buffer>, [string]>(),
    delete: jest.fn<Promise<void>, [string]>(),
    getDownloadUrl: jest.fn<Promise<string | null>, [string]>(),
  };
}

function makeGoogleDriveMock() {
  return {
    isConnected: jest.fn<Promise<boolean>, [string]>(),
    uploadFile: jest.fn<
      Promise<{ driveFileId: string }>,
      [string, Buffer, string, string]
    >(),
    downloadFile: jest.fn<Promise<Buffer>, [string, string]>(),
    deleteFile: jest.fn<Promise<void>, [string, string]>(),
  };
}

const testFile = {
  buffer: Buffer.from('pdf-bytes'),
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  size: 9,
};

interface ReferencingApplication {
  _id: Types.ObjectId;
  jobTitle: string;
  company: { name: string };
}

function makeApplicationsMock() {
  return {
    findReferencingApplications: jest.fn<
      Promise<ReferencingApplication[]>,
      [string, string]
    >(),
  };
}

function metadata(
  overrides: Partial<CreateCvMetadataInput> = {},
): CreateCvMetadataInput {
  return {
    label: 'Main resume',
    language: 'en',
    isDefault: false,
    useGoogleDrive: false,
    ...overrides,
  };
}

describe('CvsService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: CvsService;
  let cvModel: Model<CvDocument>;
  let storage: ReturnType<typeof makeStorageMock>;
  let googleDrive: ReturnType<typeof makeGoogleDriveMock>;
  let applications: ReturnType<typeof makeApplicationsMock>;
  const userId = new Types.ObjectId().toString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Cv.name, schema: CvSchema }]),
      ],
    }).compile();

    cvModel = module.get(getModelToken(Cv.name));
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(() => {
    storage = makeStorageMock();
    googleDrive = makeGoogleDriveMock();
    applications = makeApplicationsMock();
    applications.findReferencingApplications.mockResolvedValue([]);
    service = new CvsService(
      cvModel,
      storage,
      googleDrive as unknown as GoogleDriveService,
      applications as unknown as ApplicationsService,
    );
  });

  afterEach(async () => {
    await cvModel.deleteMany({});
  });

  describe('create', () => {
    it('saves to app storage by default (happy path)', async () => {
      storage.save.mockResolvedValue(undefined);

      const cv = await service.create(userId, metadata(), testFile);

      expect(cv.storageProvider).toBe('app');
      expect(storage.save).toHaveBeenCalledTimes(1);
      expect(googleDrive.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads to Google Drive when useGoogleDrive is set (happy path)', async () => {
      googleDrive.isConnected.mockResolvedValue(true);
      googleDrive.uploadFile.mockResolvedValue({ driveFileId: 'drive-file-1' });

      const cv = await service.create(
        userId,
        metadata({ useGoogleDrive: true }),
        testFile,
      );

      expect(cv.storageProvider).toBe('google-drive');
      expect(cv.fileKey).toBe('drive-file-1');
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a Google Drive upload when not connected (negative case)', async () => {
      googleDrive.isConnected.mockResolvedValue(false);

      await expect(
        service.create(userId, metadata({ useGoogleDrive: true }), testFile),
      ).rejects.toThrow('Google Drive is not connected');
      expect(googleDrive.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes from Google Drive for a Drive-backed CV (happy path)', async () => {
      googleDrive.isConnected.mockResolvedValue(true);
      googleDrive.uploadFile.mockResolvedValue({ driveFileId: 'drive-file-1' });
      const cv = await service.create(
        userId,
        metadata({ useGoogleDrive: true }),
        testFile,
      );

      await service.remove(userId, cv._id.toString());

      expect(googleDrive.deleteFile).toHaveBeenCalledWith(
        userId,
        'drive-file-1',
      );
      expect(storage.delete).not.toHaveBeenCalled();
      await expect(cvModel.findById(cv._id).exec()).resolves.toBeNull();
    });

    it('deletes from app storage for a locally-stored CV (happy path)', async () => {
      storage.save.mockResolvedValue(undefined);
      const cv = await service.create(userId, metadata(), testFile);

      await service.remove(userId, cv._id.toString());

      expect(storage.delete).toHaveBeenCalledWith(cv.fileKey);
      expect(googleDrive.deleteFile).not.toHaveBeenCalled();
    });

    it('rejects deletion and lists the referencing application(s) when the CV is still attached (negative case)', async () => {
      storage.save.mockResolvedValue(undefined);
      const cv = await service.create(userId, metadata(), testFile);
      const referencingApp = {
        _id: new Types.ObjectId(),
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
      };
      applications.findReferencingApplications.mockResolvedValue([
        referencingApp,
      ]);

      const error: ConflictException = await service
        .remove(userId, cv._id.toString())
        .catch((err: ConflictException) => err);

      expect(error).toBeInstanceOf(ConflictException);
      const response = error.getResponse() as {
        applications: { id: string; jobTitle: string; company: string }[];
      };
      expect(response.applications).toEqual([
        {
          id: referencingApp._id.toString(),
          jobTitle: 'Backend Engineer',
          company: 'Acme',
        },
      ]);
      expect(storage.delete).not.toHaveBeenCalled();
      await expect(cvModel.findById(cv._id).exec()).resolves.not.toBeNull();
    });
  });

  describe('getFile', () => {
    it('returns the file bytes for a Drive-backed CV (happy path)', async () => {
      googleDrive.isConnected.mockResolvedValue(true);
      googleDrive.uploadFile.mockResolvedValue({ driveFileId: 'drive-file-1' });
      const cv = await service.create(
        userId,
        metadata({ useGoogleDrive: true }),
        testFile,
      );
      googleDrive.downloadFile.mockResolvedValue(Buffer.from('pdf-content'));

      const result = await service.getFile(userId, cv._id.toString());

      expect(result.url).toBeNull();
      expect(result.buffer?.toString()).toBe('pdf-content');
    });

    it('marks the CV unattached and throws NotFoundException when the Drive file is gone (edge case)', async () => {
      googleDrive.isConnected.mockResolvedValue(true);
      googleDrive.uploadFile.mockResolvedValue({ driveFileId: 'drive-file-1' });
      const cv = await service.create(
        userId,
        metadata({ useGoogleDrive: true }),
        testFile,
      );
      googleDrive.downloadFile.mockRejectedValue(
        new GoogleDriveFileNotFoundError('drive-file-1'),
      );

      await expect(service.getFile(userId, cv._id.toString())).rejects.toThrow(
        NotFoundException,
      );

      const reloaded = await cvModel.findById(cv._id).exec();
      expect(reloaded?.unattachedAt).toBeInstanceOf(Date);
    });

    it('does not mark the CV unattached for an unrelated Drive error (negative case)', async () => {
      googleDrive.isConnected.mockResolvedValue(true);
      googleDrive.uploadFile.mockResolvedValue({ driveFileId: 'drive-file-1' });
      const cv = await service.create(
        userId,
        metadata({ useGoogleDrive: true }),
        testFile,
      );
      googleDrive.downloadFile.mockRejectedValue(new Error('network error'));

      await expect(service.getFile(userId, cv._id.toString())).rejects.toThrow(
        'network error',
      );

      const reloaded = await cvModel.findById(cv._id).exec();
      expect(reloaded?.unattachedAt).toBeUndefined();
    });

    it('returns local file bytes for an app-storage CV (happy path)', async () => {
      storage.save.mockResolvedValue(undefined);
      storage.getDownloadUrl.mockResolvedValue(null);
      storage.read.mockResolvedValue(Buffer.from('local-content'));
      const cv = await service.create(userId, metadata(), testFile);

      const result = await service.getFile(userId, cv._id.toString());

      expect(result.buffer?.toString()).toBe('local-content');
    });
  });
});
