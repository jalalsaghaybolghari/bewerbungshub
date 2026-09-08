import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { EmailMatchService } from './email-match.service';
import {
  EmailMatch,
  EmailMatchDocument,
  EmailMatchSchema,
} from './schemas/email-match.schema';
import {
  Application,
  ApplicationDocument,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { ApplicationsService } from '../applications/applications.service';

jest.setTimeout(60000);

// Real Mongoose documents via mongodb-memory-server (same convention as
// gmail-sync.service.spec.ts) — the resolvedAt/resolution bookkeeping
// here is exactly the kind of thing worth exercising for real rather
// than through a mock.
describe('EmailMatchService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: EmailMatchService;
  let emailMatchModel: Model<EmailMatchDocument>;
  let applicationModel: Model<ApplicationDocument>;
  const userId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: EmailMatch.name, schema: EmailMatchSchema },
          { name: Application.name, schema: ApplicationSchema },
        ]),
      ],
      providers: [
        EmailMatchService,
        { provide: ApplicationsService, useValue: { changeStatus: jest.fn() } },
      ],
    }).compile();

    service = module.get(EmailMatchService);
    emailMatchModel = module.get(getModelToken(EmailMatch.name));
    applicationModel = module.get(getModelToken(Application.name));
    await emailMatchModel.init();
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  afterEach(async () => {
    await Promise.all([
      emailMatchModel.deleteMany({}),
      applicationModel.deleteMany({}),
    ]);
  });

  function makeUnmatched(overrides: Partial<Record<string, unknown>> = {}) {
    return emailMatchModel.create({
      userId,
      gmailMessageId: `msg-${new Types.ObjectId().toString()}`,
      fromAddress: 'reply@mail.onlyfy.jobs',
      subject: 'Your application at Acme',
      snippet: 'Unfortunately...',
      receivedAt: new Date(),
      classification: 'rejection',
      decision: 'no_action',
      ...overrides,
    });
  }

  describe('findUnmatched', () => {
    it('excludes a dismissed (rejected) unmatched email (regression guard — must actually disappear once rejected)', async () => {
      const match = await makeUnmatched();

      await service.rejectUnmatched(userId.toString(), match._id.toString());
      const result = await service.findUnmatched(userId.toString());

      expect(result).toHaveLength(0);
    });

    it('still lists an unmatched email that has not been dismissed (happy path)', async () => {
      await makeUnmatched({ subject: 'Your application at Globex' });

      const result = await service.findUnmatched(userId.toString());

      expect(result).toHaveLength(1);
    });
  });

  describe('rejectUnmatched', () => {
    it('marks the match resolved as a user rejection (happy path)', async () => {
      const match = await makeUnmatched();

      await service.rejectUnmatched(userId.toString(), match._id.toString());

      const reloaded = await emailMatchModel.findById(match._id).exec();
      expect(reloaded).toMatchObject({
        resolvedBy: 'user',
        resolution: 'rejected',
      });
      expect(reloaded?.resolvedAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException for another user's match (negative case)", async () => {
      const match = await makeUnmatched();

      await expect(
        service.rejectUnmatched(otherUserId.toString(), match._id.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException for a match that already has an application (negative case — that is a pending-approval row, not an unmatched one)', async () => {
      const application = await applicationModel.create({
        userId,
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
        jobDescription: 'x',
        applyLink: 'https://example.com/job',
        applyType: 'linkedin',
        status: 'applied',
      });
      const match = await makeUnmatched({
        applicationId: application._id,
        decision: 'pending_approval',
        proposedStatus: 'rejected',
      });

      await expect(
        service.rejectUnmatched(userId.toString(), match._id.toString()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException for a classification:none match (negative case — not an unmatched row either)', async () => {
      const match = await makeUnmatched({ classification: 'none' });

      await expect(
        service.rejectUnmatched(userId.toString(), match._id.toString()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when already resolved (negative case)', async () => {
      const match = await makeUnmatched();
      await service.rejectUnmatched(userId.toString(), match._id.toString());

      await expect(
        service.rejectUnmatched(userId.toString(), match._id.toString()),
      ).rejects.toThrow(ConflictException);
    });
  });
});
