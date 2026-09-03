import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import type { CreateApplicationInput } from '@bewerber/shared';
import { ApplicationsService } from './applications.service';
import {
  Application,
  ApplicationDocument,
  ApplicationSchema,
} from './schemas/application.schema';
import { Event, EventDocument, EventSchema } from './schemas/event.schema';
import { InterviewsService } from '../interviews/interviews.service';
import {
  Interview,
  InterviewDocument,
  InterviewSchema,
} from '../interviews/schemas/interview.schema';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import {
  FollowUp,
  FollowUpDocument,
  FollowUpSchema,
} from '../follow-ups/schemas/follow-up.schema';

// First spec file in the repo to use mongodb-memory-server (already an
// unused devDependency) — findDuplicateGroups/merge exercise real
// bucketing/updateMany/recomputeNextFollowUp interactions that aren't
// practical to hand-mock faithfully against Mongoose models.
jest.setTimeout(60000);

function baseApplicationInput(
  overrides: Partial<CreateApplicationInput> = {},
): CreateApplicationInput {
  return {
    jobTitle: 'Backend Engineer',
    company: { name: 'Acme' },
    location: { raw: 'Vienna' },
    jobDescription: 'Build things.',
    applyLink: `https://example.com/jobs/${Math.random()}`,
    applyType: 'website',
    status: 'applied',
    tags: [],
    ...overrides,
  };
}

describe('ApplicationsService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: ApplicationsService;
  let applicationModel: Model<ApplicationDocument>;
  let eventModel: Model<EventDocument>;
  let interviewModel: Model<InterviewDocument>;
  let followUpModel: Model<FollowUpDocument>;
  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Application.name, schema: ApplicationSchema },
          { name: Event.name, schema: EventSchema },
          { name: Interview.name, schema: InterviewSchema },
          { name: FollowUp.name, schema: FollowUpSchema },
        ]),
      ],
      providers: [ApplicationsService, InterviewsService, FollowUpsService],
    }).compile();

    service = module.get(ApplicationsService);
    applicationModel = module.get(getModelToken(Application.name));
    eventModel = module.get(getModelToken(Event.name));
    interviewModel = module.get(getModelToken(Interview.name));
    followUpModel = module.get(getModelToken(FollowUp.name));
    // Mongoose builds indexes in the background after model registration —
    // without waiting for them, the unique (userId, applyLink) index isn't
    // live yet when the earliest tests run, so a duplicate-key test would
    // flakily pass through instead of throwing.
    await applicationModel.init();
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await applicationModel.deleteMany({});
    await eventModel.deleteMany({});
    await interviewModel.deleteMany({});
    await followUpModel.deleteMany({});
  });

  async function createApplication(
    overrides: Partial<CreateApplicationInput> = {},
    forUserId = userId,
  ): Promise<ApplicationDocument> {
    return service.create(forUserId, baseApplicationInput(overrides));
  }

  describe('update', () => {
    it('updates the given fields (happy path)', async () => {
      const app = await createApplication({ jobTitle: 'Backend Engineer' });

      const updated = await service.update(userId, app._id.toString(), {
        jobTitle: 'Senior Backend Engineer',
      });

      expect(updated.jobTitle).toBe('Senior Backend Engineer');
    });

    it('throws ConflictException instead of a raw 500 when the new applyLink collides with another application (negative case)', async () => {
      await createApplication({ applyLink: 'https://example.com/jobs/taken' });
      const app = await createApplication({
        applyLink: 'https://example.com/jobs/free',
      });

      await expect(
        service.update(userId, app._id.toString(), {
          applyLink: 'https://example.com/jobs/taken',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows two different applications to share the same email apply address (happy path)', async () => {
      await createApplication({
        applyType: 'email',
        applyLink: 'jobs@company.com',
      });
      const second = await createApplication({
        applyType: 'email',
        applyLink: 'jobs@company.com',
      });

      expect(second.applyType).toBe('email');
    });

    it('lets a re-typed application share an email address after changing to applyType: email (edge case)', async () => {
      await createApplication({
        applyType: 'email',
        applyLink: 'jobs@company.com',
      });
      const app = await createApplication({
        applyType: 'website',
        applyLink: 'https://example.com/jobs/other',
      });

      const updated = await service.update(userId, app._id.toString(), {
        applyType: 'email',
        applyLink: 'jobs@company.com',
      });

      expect(updated.applyType).toBe('email');
    });

    it('re-enforces uniqueness once an application switches away from applyType: email (edge case)', async () => {
      await createApplication({
        applyType: 'website',
        applyLink: 'https://example.com/jobs/taken',
      });
      const app = await createApplication({
        applyType: 'email',
        applyLink: 'https://example.com/jobs/taken',
      });

      await expect(
        service.update(userId, app._id.toString(), { applyType: 'website' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findDuplicateGroups', () => {
    it('finds a pair with the same company and a similar title (happy path)', async () => {
      const a = await createApplication({
        jobTitle: 'Senior Backend Engineer',
      });
      const b = await createApplication({
        jobTitle: 'Backend Engineer, Senior',
      });

      const pairs = await service.findDuplicateGroups(userId);

      expect(pairs).toHaveLength(1);
      const ids = [pairs[0].a._id.toString(), pairs[0].b._id.toString()];
      expect(ids).toEqual(
        expect.arrayContaining([a._id.toString(), b._id.toString()]),
      );
    });

    it('returns every pairwise-similar combination within a 3-application bucket (edge case)', async () => {
      await createApplication({ jobTitle: 'Backend Engineer' });
      await createApplication({ jobTitle: 'Backend Engineer' });
      await createApplication({ jobTitle: 'Backend Engineer' });

      const pairs = await service.findDuplicateGroups(userId);

      expect(pairs).toHaveLength(3);
    });

    it('does not pair different companies even with an identical title (edge case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
      });
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Globex' },
      });

      const pairs = await service.findDuplicateGroups(userId);

      expect(pairs).toHaveLength(0);
    });

    it('does not pair the same company and title in different locations (edge case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
      });
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Berlin' },
      });

      const pairs = await service.findDuplicateGroups(userId);

      expect(pairs).toHaveLength(0);
    });

    it('excludes archived applications (negative case)', async () => {
      const a = await createApplication({ jobTitle: 'Backend Engineer' });
      const b = await createApplication({ jobTitle: 'Backend Engineer' });
      await service.remove(userId, b._id.toString());

      const pairs = await service.findDuplicateGroups(userId);

      expect(pairs).toHaveLength(0);
      expect(a).toBeDefined();
    });

    it('returns an empty array for a single application (negative case)', async () => {
      await createApplication();
      const pairs = await service.findDuplicateGroups(userId);
      expect(pairs).toEqual([]);
    });
  });

  describe('findSimilarApplications', () => {
    it('finds a fuzzy match against an existing application (happy path)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme GmbH' },
        location: { raw: 'Vienna' },
      });

      const matches = await service.findSimilarApplications(
        userId,
        'Backend Engineer',
        'Acme',
        'Vienna',
      );

      expect(matches).toHaveLength(1);
    });

    it('returns an exact match via the fast-path (edge case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
      });

      const matches = await service.findSimilarApplications(
        userId,
        'Backend Engineer',
        'Acme',
        'Vienna',
      );

      expect(matches).toHaveLength(1);
    });

    it('returns no matches for an unrelated job (negative case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
      });

      const matches = await service.findSimilarApplications(
        userId,
        'Marketing Intern',
        'Globex',
        'Berlin',
      );

      expect(matches).toEqual([]);
    });

    it('does not match when the location differs, even with the same title and company (edge case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
      });

      const matches = await service.findSimilarApplications(
        userId,
        'Backend Engineer',
        'Acme',
        'Berlin',
      );

      expect(matches).toEqual([]);
    });

    it('still matches when one location is the other plus extra detail (edge case)', async () => {
      await createApplication({
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
        location: { raw: 'Vienna' },
      });

      const matches = await service.findSimilarApplications(
        userId,
        'Backend Engineer',
        'Acme',
        'Vienna, Austria',
      );

      expect(matches).toHaveLength(1);
    });
  });

  describe('findReferencingApplications', () => {
    it('returns the active application(s) that reference the CV (happy path)', async () => {
      const cvId = new Types.ObjectId().toString();
      const app = await createApplication({
        cvId,
        jobTitle: 'Backend Engineer',
        company: { name: 'Acme' },
      });

      const results = await service.findReferencingApplications(userId, cvId);

      expect(results).toHaveLength(1);
      expect(results[0]._id.toString()).toBe(app._id.toString());
      expect(results[0].jobTitle).toBe('Backend Engineer');
      expect(results[0].company.name).toBe('Acme');
    });

    it('returns an empty array when no application references the CV (negative case)', async () => {
      const cvId = new Types.ObjectId().toString();
      await createApplication({ cvId: new Types.ObjectId().toString() });

      await expect(
        service.findReferencingApplications(userId, cvId),
      ).resolves.toEqual([]);
    });

    it('excludes an archived application that references the CV (edge case)', async () => {
      const cvId = new Types.ObjectId().toString();
      const app = await createApplication({ cvId });
      await service.remove(userId, app._id.toString());

      await expect(
        service.findReferencingApplications(userId, cvId),
      ).resolves.toEqual([]);
    });

    it("ignores another user's applications (negative case)", async () => {
      const cvId = new Types.ObjectId().toString();
      await createApplication({ cvId }, otherUserId);

      await expect(
        service.findReferencingApplications(userId, cvId),
      ).resolves.toEqual([]);
    });
  });

  describe('merge', () => {
    it('unions tags, sums followUpCount, concatenates notes, and archives the merged application (happy path)', async () => {
      const keep = await createApplication({
        jobTitle: 'Backend Engineer',
        tags: ['remote'],
        notes: 'Keeper note.',
      });
      const merged = await createApplication({
        jobTitle: 'Backend Engineer',
        tags: ['urgent'],
        notes: 'Merged note.',
      });

      const result = await service.merge(
        userId,
        keep._id.toString(),
        merged._id.toString(),
      );

      expect(result.tags.sort()).toEqual(['remote', 'urgent']);
      expect(result.notes).toBe('Keeper note.\n\nMerged note.');

      const mergedAfter = await applicationModel.findById(merged._id).exec();
      expect(mergedAfter?.archivedAt).toBeInstanceOf(Date);
    });

    it('reassigns interviews and follow-ups, and recomputes the keeper nextFollowUpAt (happy path)', async () => {
      const keep = await createApplication({ jobTitle: 'Backend Engineer' });
      const merged = await createApplication({ jobTitle: 'Backend Engineer' });

      const soonDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await followUpModel.create({
        applicationId: merged._id,
        userId: new Types.ObjectId(userId),
        dueAt: soonDueAt,
        channel: 'email',
        status: 'scheduled',
      });
      await interviewModel.create({
        applicationId: merged._id,
        userId: new Types.ObjectId(userId),
        round: 1,
        type: 'phone_screen',
        scheduledAt: new Date(),
      });

      const result = await service.merge(
        userId,
        keep._id.toString(),
        merged._id.toString(),
      );

      const interviewsForKeep = await interviewModel
        .find({ applicationId: keep._id })
        .exec();
      const followUpsForKeep = await followUpModel
        .find({ applicationId: keep._id })
        .exec();
      expect(interviewsForKeep).toHaveLength(1);
      expect(followUpsForKeep).toHaveLength(1);
      expect(result.nextFollowUpAt?.getTime()).toBe(soonDueAt.getTime());
    });

    it('backfills a blank keeper field from the merged application without clobbering a set one (edge case)', async () => {
      const keep = await createApplication({ jobTitle: 'Backend Engineer' });
      const merged = await createApplication({
        jobTitle: 'Backend Engineer',
        sourceUrl: 'https://example.com/source',
      });

      const result = await service.merge(
        userId,
        keep._id.toString(),
        merged._id.toString(),
      );

      expect(result.sourceUrl).toBe('https://example.com/source');
    });

    it('never overwrites a keeper field that is already set (edge case)', async () => {
      const keep = await createApplication({
        jobTitle: 'Backend Engineer',
        sourceUrl: 'https://example.com/keeper-source',
      });
      const merged = await createApplication({
        jobTitle: 'Backend Engineer',
        sourceUrl: 'https://example.com/merged-source',
      });

      const result = await service.merge(
        userId,
        keep._id.toString(),
        merged._id.toString(),
      );

      expect(result.sourceUrl).toBe('https://example.com/keeper-source');
    });

    it('throws ConflictException when merging an application into itself (negative case)', async () => {
      const app = await createApplication();

      await expect(
        service.merge(userId, app._id.toString(), app._id.toString()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when either id belongs to another user (negative case)', async () => {
      const mine = await createApplication();
      const theirs = await createApplication({}, otherUserId);

      await expect(
        service.merge(userId, mine._id.toString(), theirs._id.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when mergeId does not exist (negative case)', async () => {
      const keep = await createApplication();
      const missingId = new Types.ObjectId().toString();

      await expect(
        service.merge(userId, keep._id.toString(), missingId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
