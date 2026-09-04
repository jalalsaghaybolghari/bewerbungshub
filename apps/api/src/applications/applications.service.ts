import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import type {
  ApplicationQuery,
  ChangeApplicationStatusInput,
  CreateApplicationInput,
  DuplicateGroupsQuery,
  UpdateApplicationInput,
} from '@bewerber/shared';
import {
  isLikelyDuplicate,
  normalizeForSimilarity,
  scoreJobSimilarity,
} from '@bewerber/shared';
import { Application, ApplicationDocument } from './schemas/application.schema';
import { Event, EventDocument } from './schemas/event.schema';
import { InterviewsService } from '../interviews/interviews.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';

const DUPLICATE_KEY_ERROR = 11000;

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    private readonly interviewsService: InterviewsService,
    private readonly followUpsService: FollowUpsService,
  ) {}

  async create(
    userId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationDocument> {
    try {
      const application = await this.applicationModel.create({
        ...input,
        userId: new Types.ObjectId(userId),
        // 'draft' means "captured, not sent yet" (e.g. the extension's
        // default) — sentAt should stay unset until it actually leaves
        // draft, either right here (created directly as e.g. 'applied')
        // or later via changeStatus.
        sentAt: input.status === 'draft' ? undefined : new Date(),
      });
      await this.writeEvent(application._id, userId, 'created', 'user', {
        status: application.status,
      });
      return application;
    } catch (err) {
      if (this.isDuplicateKeyError(err)) {
        throw new ConflictException(
          'An application with this apply link already exists',
        );
      }
      throw err;
    }
  }

  async findAllForUser(userId: string, query: ApplicationQuery) {
    const filter: QueryFilter<Application> = {
      userId: new Types.ObjectId(userId),
      archivedAt: { $exists: false },
    };
    if (query.status) filter.status = query.status;
    if (query.applyType) filter.applyType = query.applyType;
    if (query.tag) filter.tags = query.tag;
    if (query.favorite) filter.favorite = true;
    if (query.q) filter.$text = { $search: query.q };

    const sortField = query.sort.replace(/^-/, '');
    const sortDir = query.sort.startsWith('-') ? -1 : 1;

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(query.pageSize)
        .exec(),
      this.applicationModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOneForUser(userId: string, id: string) {
    const application = await this.applicationModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const applicationId = application._id.toString();
    const [events, interviews, followUps] = await Promise.all([
      this.eventModel
        .find({ applicationId: application._id })
        .sort({ occurredAt: 1 })
        .exec(),
      this.interviewsService.findAllForApplication(applicationId),
      this.followUpsService.findAllForApplication(applicationId),
    ]);

    return { application, events, interviews, followUps };
  }

  async update(
    userId: string,
    id: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationDocument> {
    // Status is intentionally excluded here — it has its own governed path
    // (changeStatus) that always writes an audit event. Silently dropping it
    // from a general PATCH keeps that the only way to move the pipeline.
    const fields = { ...input };
    delete fields.status;
    const application = await this.applicationModel
      .findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { $set: fields },
        { returnDocument: 'after' },
      )
      .exec();
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async changeStatus(
    userId: string,
    id: string,
    input: ChangeApplicationStatusInput,
  ): Promise<ApplicationDocument> {
    const application = await this.applicationModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!application) throw new NotFoundException('Application not found');

    const from = application.status;
    application.status = input.status;
    application.statusChangedAt = new Date();
    application.statusSetBy = 'user';
    // First time it leaves 'draft' — same rule as create(). Never
    // overwritten again on later transitions (e.g. applied -> interview).
    if (!application.sentAt && input.status !== 'draft') {
      application.sentAt = new Date();
    }
    await application.save();

    await this.writeEvent(application._id, userId, 'status_changed', 'user', {
      from,
      to: input.status,
      note: input.note,
    });

    return application;
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.applicationModel
      .updateOne(
        { _id: id, userId: new Types.ObjectId(userId) },
        { archivedAt: new Date() },
      )
      .exec();
    if (result.matchedCount === 0)
      throw new NotFoundException('Application not found');
  }

  async getStats(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const baseFilter = { userId: userObjectId, archivedAt: { $exists: false } };
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      total,
      byStatusAgg,
      byApplyTypeAgg,
      sentThisWeek,
      respondedCount,
      sentCount,
      overdueFollowUps,
    ] = await Promise.all([
      this.applicationModel.countDocuments(baseFilter).exec(),
      this.applicationModel.aggregate<{ _id: string; count: number }>([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.applicationModel.aggregate<{ _id: string; count: number }>([
        { $match: baseFilter },
        { $group: { _id: '$applyType', count: { $sum: 1 } } },
      ]),
      this.applicationModel
        .countDocuments({ ...baseFilter, sentAt: { $gte: weekAgo } })
        .exec(),
      this.applicationModel
        .countDocuments({
          ...baseFilter,
          status: { $nin: ['draft', 'applied'] },
        })
        .exec(),
      this.applicationModel
        .countDocuments({ ...baseFilter, status: { $ne: 'draft' } })
        .exec(),
      this.applicationModel
        .find({ ...baseFilter, nextFollowUpAt: { $lt: new Date() } })
        .sort({ nextFollowUpAt: 1 })
        .limit(10)
        .select('jobTitle company.name nextFollowUpAt')
        .exec(),
    ]);

    const avgDaysToFirstResponse =
      await this.computeAvgDaysToFirstResponse(userObjectId);

    return {
      total,
      sentThisWeek,
      responseRate:
        sentCount > 0 ? Math.round((respondedCount / sentCount) * 100) : 0,
      avgDaysToFirstResponse,
      byStatus: Object.fromEntries(byStatusAgg.map((r) => [r._id, r.count])),
      byApplyType: Object.fromEntries(
        byApplyTypeAgg.map((r) => [r._id, r.count]),
      ),
      overdueFollowUps,
    };
  }

  private async computeAvgDaysToFirstResponse(
    userId: Types.ObjectId,
  ): Promise<number | null> {
    const result = await this.eventModel.aggregate<{ avgMs: number }>([
      { $match: { userId, type: 'status_changed' } },
      { $sort: { occurredAt: 1 } },
      {
        $group: {
          _id: '$applicationId',
          firstResponseAt: { $first: '$occurredAt' },
        },
      },
      {
        $lookup: {
          from: 'applications',
          localField: '_id',
          foreignField: '_id',
          as: 'application',
        },
      },
      { $unwind: '$application' },
      {
        $project: {
          diffMs: { $subtract: ['$firstResponseAt', '$application.sentAt'] },
        },
      },
      { $group: { _id: null, avgMs: { $avg: '$diffMs' } } },
    ]);

    const avgMs = result[0]?.avgMs;
    return avgMs ? Math.round(avgMs / (24 * 60 * 60 * 1000)) : null;
  }

  async checkDuplicate(
    userId: string,
    applyLink: string,
  ): Promise<{ exists: boolean; id: string | null }> {
    const application = await this.applicationModel
      .findOne({ userId: new Types.ObjectId(userId), applyLink })
      .exec();
    return { exists: !!application, id: application?._id.toString() ?? null };
  }

  // Fuzzy near-duplicate scan across the user's own active applications.
  // When company is one of the required dimensions, buckets by exact
  // normalized company name first and only scores pairs *within* each
  // bucket — keeps this cheap (no O(n^2) comparison across the whole
  // list), at the deliberate cost that two companies whose normalized
  // names don't land in the same bucket (e.g. "Acme Inc." vs "Acme
  // Incorporated" — the suffix list doesn't cover "Incorporated") never
  // get compared. When company isn't required (the user unchecked it —
  // e.g. matching by title or location alone), that optimization doesn't
  // apply — a match could be between two entirely different companies —
  // so every active application is scanned pairwise instead. Still
  // acceptable: bounded by one user's own dataset, same as the
  // already-O(n^2)-within-a-bucket case above.
  async findDuplicateGroups(
    userId: string,
    dimensions: DuplicateGroupsQuery,
  ): Promise<
    Array<{
      a: ApplicationDocument;
      b: ApplicationDocument;
      titleSimilarity: number;
      companySimilarity: number;
      locationSimilarity: number;
    }>
  > {
    const applications = await this.applicationModel
      .find({
        userId: new Types.ObjectId(userId),
        archivedAt: { $exists: false },
      })
      .exec();

    const buckets = new Map<string, ApplicationDocument[]>();
    for (const app of applications) {
      const key = dimensions.company
        ? normalizeForSimilarity(app.company.name, {
            stripCompanySuffixes: true,
          })
        : '__all__';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(app);
      else buckets.set(key, [app]);
    }

    const pairs: Array<{
      a: ApplicationDocument;
      b: ApplicationDocument;
      titleSimilarity: number;
      companySimilarity: number;
      locationSimilarity: number;
    }> = [];
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const score = scoreJobSimilarity(
            {
              jobTitle: bucket[i].jobTitle,
              companyName: bucket[i].company.name,
              locationRaw: bucket[i].location.raw,
            },
            {
              jobTitle: bucket[j].jobTitle,
              companyName: bucket[j].company.name,
              locationRaw: bucket[j].location.raw,
            },
          );
          if (isLikelyDuplicate(score, dimensions)) {
            pairs.push({
              a: bucket[i],
              b: bucket[j],
              titleSimilarity: score.titleSimilarity,
              companySimilarity: score.companySimilarity,
              locationSimilarity: score.locationSimilarity,
            });
          }
        }
      }
    }
    return pairs;
  }

  // Used by the extension's pre-save check against a candidate that hasn't
  // been saved yet — a single candidate against the user's whole active
  // list, so this is already O(n) and needs no bucketing.
  async findSimilarApplications(
    userId: string,
    jobTitle: string,
    companyName: string,
    locationRaw: string,
  ): Promise<ApplicationDocument[]> {
    const active = await this.applicationModel
      .find({
        userId: new Types.ObjectId(userId),
        archivedAt: { $exists: false },
      })
      .exec();

    return active.filter((app) =>
      isLikelyDuplicate(
        scoreJobSimilarity(
          { jobTitle, companyName, locationRaw },
          {
            jobTitle: app.jobTitle,
            companyName: app.company.name,
            locationRaw: app.location.raw,
          },
        ),
      ),
    );
  }

  async merge(
    userId: string,
    keepId: string,
    mergeId: string,
  ): Promise<ApplicationDocument> {
    if (keepId === mergeId) {
      throw new ConflictException('Cannot merge an application into itself');
    }

    const userObjectId = new Types.ObjectId(userId);
    const [keep, merged] = await Promise.all([
      this.applicationModel
        .findOne({ _id: keepId, userId: userObjectId })
        .exec(),
      this.applicationModel
        .findOne({ _id: mergeId, userId: userObjectId })
        .exec(),
    ]);
    if (!keep || !merged) throw new NotFoundException('Application not found');

    await this.interviewsService.reassignToApplication(mergeId, keepId);
    await this.followUpsService.reassignToApplication(mergeId, keepId);
    await this.eventModel
      .updateMany(
        { applicationId: merged._id },
        { $set: { applicationId: keep._id } },
      )
      .exec();

    // followUpsService.reassignToApplication just wrote keep's
    // nextFollowUpAt directly in the DB (via recomputeNextFollowUp) — the
    // in-memory `keep` loaded above predates that write, so reload it
    // before layering on the rest of the merge changes below.
    const refreshedKeep = await this.applicationModel.findById(keep._id).exec();
    if (!refreshedKeep) throw new NotFoundException('Application not found');

    refreshedKeep.tags = Array.from(
      new Set([...refreshedKeep.tags, ...merged.tags]),
    );
    refreshedKeep.followUpCount += merged.followUpCount;
    refreshedKeep.notes =
      [refreshedKeep.notes, merged.notes].filter(Boolean).join('\n\n') ||
      undefined;
    refreshedKeep.sourceUrl ??= merged.sourceUrl;
    refreshedKeep.cvId ??= merged.cvId;
    refreshedKeep.postedAt ??= merged.postedAt;
    refreshedKeep.location.remoteType ??= merged.location.remoteType;
    refreshedKeep.company.website ??= merged.company.website;
    refreshedKeep.company.domain ??= merged.company.domain;
    await refreshedKeep.save();

    merged.archivedAt = new Date();
    await merged.save();

    await this.writeEvent(refreshedKeep._id, userId, 'note', 'user', {
      mergedApplicationId: mergeId,
      mergedJobTitle: merged.jobTitle,
      mergedCompany: merged.company.name,
    });

    return refreshedKeep;
  }

  private async writeEvent(
    applicationId: Types.ObjectId,
    userId: string,
    type: 'created' | 'status_changed' | 'note',
    actor: 'user' | 'system',
    payload: Record<string, unknown>,
  ) {
    await this.eventModel.create({
      applicationId,
      userId: new Types.ObjectId(userId),
      type,
      actor,
      occurredAt: new Date(),
      payload,
    });
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === DUPLICATE_KEY_ERROR
    );
  }
}
