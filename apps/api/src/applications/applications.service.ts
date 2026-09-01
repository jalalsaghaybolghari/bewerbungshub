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
  UpdateApplicationInput,
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
