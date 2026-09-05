import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { AdminService } from './admin.service';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import {
  Application,
  ApplicationDocument,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  Event,
  EventDocument,
  EventSchema,
} from '../applications/schemas/event.schema';
import { Cv, CvDocument, CvSchema } from '../cvs/schemas/cv.schema';
import { CvsService } from '../cvs/cvs.service';
import { ApplicationsService } from '../applications/applications.service';
import {
  Interview,
  InterviewDocument,
  InterviewSchema,
} from '../interviews/schemas/interview.schema';
import { InterviewsService } from '../interviews/interviews.service';
import {
  FollowUp,
  FollowUpDocument,
  FollowUpSchema,
} from '../follow-ups/schemas/follow-up.schema';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { StorageService } from '../storage/storage.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';

jest.setTimeout(60000);

function makeStorageMock() {
  return {
    save: jest.fn<Promise<void>, [string, Buffer, string]>(),
    read: jest.fn<Promise<Buffer>, [string]>(),
    delete: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
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
    deleteFile: jest
      .fn<Promise<void>, [string, string]>()
      .mockResolvedValue(undefined),
  };
}

describe('AdminService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: AdminService;
  let userModel: Model<UserDocument>;
  let applicationModel: Model<ApplicationDocument>;
  let cvModel: Model<CvDocument>;
  let eventModel: Model<EventDocument>;
  let interviewModel: Model<InterviewDocument>;
  let followUpModel: Model<FollowUpDocument>;
  let storage: ReturnType<typeof makeStorageMock>;
  let googleDrive: ReturnType<typeof makeGoogleDriveMock>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    storage = makeStorageMock();
    googleDrive = makeGoogleDriveMock();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Application.name, schema: ApplicationSchema },
          { name: Event.name, schema: EventSchema },
          { name: Cv.name, schema: CvSchema },
          { name: Interview.name, schema: InterviewSchema },
          { name: FollowUp.name, schema: FollowUpSchema },
        ]),
      ],
      providers: [
        AdminService,
        UsersService,
        CvsService,
        ApplicationsService,
        InterviewsService,
        FollowUpsService,
        { provide: StorageService, useValue: storage },
        { provide: GoogleDriveService, useValue: googleDrive },
      ],
    }).compile();

    service = module.get(AdminService);
    userModel = module.get(getModelToken(User.name));
    applicationModel = module.get(getModelToken(Application.name));
    cvModel = module.get(getModelToken(Cv.name));
    eventModel = module.get(getModelToken(Event.name));
    interviewModel = module.get(getModelToken(Interview.name));
    followUpModel = module.get(getModelToken(FollowUp.name));
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}),
      applicationModel.deleteMany({}),
      cvModel.deleteMany({}),
      eventModel.deleteMany({}),
      interviewModel.deleteMany({}),
      followUpModel.deleteMany({}),
    ]);
    jest.clearAllMocks();
  });

  async function seedUser(overrides: Partial<User> = {}) {
    return userModel.create({
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      passwordHash: 'irrelevant',
      displayName: 'Test User',
      emailVerified: true,
      ...overrides,
    });
  }

  describe('listUsers', () => {
    it('returns correct per-user application and CV counts (happy path)', async () => {
      const user = await seedUser();
      await applicationModel.create([
        {
          userId: user._id,
          jobTitle: 'A',
          company: { name: 'Acme' },
          location: { raw: 'Vienna' },
          jobDescription: 'x',
          applyLink: 'https://example.com/1',
          applyType: 'website',
        },
        {
          userId: user._id,
          jobTitle: 'B',
          company: { name: 'Acme' },
          location: { raw: 'Vienna' },
          jobDescription: 'x',
          applyLink: 'https://example.com/2',
          applyType: 'website',
        },
      ]);
      await cvModel.create({
        userId: user._id,
        label: 'Main',
        language: 'en',
        fileKey: 'key-1',
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });

      const result = await service.listUsers({ page: 1, pageSize: 20 });

      const item = result.items.find((i) => i.id === user._id.toString());
      expect(item).toMatchObject({ applicationCount: 2, cvCount: 1 });
    });

    it('paginates results (edge case)', async () => {
      await Promise.all([seedUser(), seedUser(), seedUser()]);

      const page1 = await service.listUsers({ page: 1, pageSize: 2 });
      const page2 = await service.listUsers({ page: 2, pageSize: 2 });

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(3);
    });
  });

  describe('getStats', () => {
    it('aggregates counts correctly (happy path)', async () => {
      await seedUser({ emailVerified: true, isAdmin: true });
      await seedUser({ emailVerified: false });
      const active = await seedUser();
      await applicationModel.create({
        userId: active._id,
        jobTitle: 'A',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
        jobDescription: 'x',
        applyLink: 'https://example.com/1',
        applyType: 'website',
      });
      await applicationModel.create({
        userId: active._id,
        jobTitle: 'B (archived)',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
        jobDescription: 'x',
        applyLink: 'https://example.com/2',
        applyType: 'website',
        archivedAt: new Date(),
      });

      const stats = await service.getStats();

      expect(stats.totalUsers).toBe(3);
      expect(stats.verifiedUsers).toBe(2);
      expect(stats.adminUsers).toBe(1);
      // Archived application excluded, same convention as
      // ApplicationsService.getStats.
      expect(stats.totalApplications).toBe(1);
      expect(stats.newUsersLast7Days).toBe(3);
    });
  });

  describe('deleteUser', () => {
    async function seedFullUser() {
      const user = await seedUser();
      const suffix = user._id.toString();
      const application = await applicationModel.create({
        userId: user._id,
        jobTitle: 'A',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
        jobDescription: 'x',
        applyLink: `https://example.com/${suffix}`,
        applyType: 'website',
      });
      await cvModel.create({
        userId: user._id,
        label: 'Main',
        language: 'en',
        fileKey: `local-key-${suffix}`,
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      await cvModel.create({
        userId: user._id,
        label: 'Drive CV',
        language: 'en',
        fileKey: `drive-key-${suffix}`,
        storageProvider: 'google-drive',
        fileName: 'cv2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      await interviewModel.create({
        applicationId: application._id,
        userId: user._id,
        round: 1,
        type: 'hr',
        scheduledAt: new Date(),
      });
      await followUpModel.create({
        applicationId: application._id,
        userId: user._id,
        dueAt: new Date(),
        channel: 'email',
      });
      await eventModel.create({
        applicationId: application._id,
        userId: user._id,
        type: 'created',
      });
      return user;
    }

    it('removes every document across all collections for the target user, cleans up storage, and leaves other users untouched (happy path)', async () => {
      const target = await seedFullUser();
      const control = await seedFullUser();

      await service.deleteUser('some-admin-id', target._id.toString());

      const [users, applications, cvs, interviews, followUps, events] =
        await Promise.all([
          userModel.find({}).exec(),
          applicationModel.find({ userId: target._id }).exec(),
          cvModel.find({ userId: target._id }).exec(),
          interviewModel.find({ userId: target._id }).exec(),
          followUpModel.find({ userId: target._id }).exec(),
          eventModel.find({ userId: target._id }).exec(),
        ]);

      expect(users.map((u) => u._id.toString())).not.toContain(
        target._id.toString(),
      );
      expect(applications).toHaveLength(0);
      expect(cvs).toHaveLength(0);
      expect(interviews).toHaveLength(0);
      expect(followUps).toHaveLength(0);
      expect(events).toHaveLength(0);

      // Control user's data (same collections) is untouched.
      const controlUser = await userModel.findById(control._id).exec();
      const controlApplications = await applicationModel
        .find({ userId: control._id })
        .exec();
      expect(controlUser).not.toBeNull();
      expect(controlApplications).toHaveLength(1);

      const targetId = target._id.toString();
      expect(storage.delete).toHaveBeenCalledWith(`local-key-${targetId}`);
      expect(googleDrive.deleteFile).toHaveBeenCalledWith(
        targetId,
        `drive-key-${targetId}`,
      );
    });

    it('removes archived applications too, unlike a normal single-application delete (edge case)', async () => {
      const target = await seedUser();
      await applicationModel.create({
        userId: target._id,
        jobTitle: 'Archived',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
        jobDescription: 'x',
        applyLink: 'https://example.com/archived',
        applyType: 'website',
        archivedAt: new Date(),
      });

      await service.deleteUser('some-admin-id', target._id.toString());

      const remaining = await applicationModel
        .find({ userId: target._id })
        .exec();
      expect(remaining).toHaveLength(0);
    });

    it('throws ForbiddenException instead of deleting when the admin targets their own account (negative case)', async () => {
      const admin = await seedUser({ isAdmin: true });

      await expect(
        service.deleteUser(admin._id.toString(), admin._id.toString()),
      ).rejects.toThrow(ForbiddenException);

      const stillThere = await userModel.findById(admin._id).exec();
      expect(stillThere).not.toBeNull();
    });

    it('throws NotFoundException for a nonexistent target user (negative case)', async () => {
      const bogusId = new Types.ObjectId().toString();

      await expect(
        service.deleteUser('some-admin-id', bogusId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
