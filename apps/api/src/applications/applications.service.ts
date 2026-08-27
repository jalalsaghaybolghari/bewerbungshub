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

const DUPLICATE_KEY_ERROR = 11000;

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
  ) {}

  async create(
    userId: string,
    input: CreateApplicationInput,
  ): Promise<ApplicationDocument> {
    try {
      const application = await this.applicationModel.create({
        ...input,
        userId: new Types.ObjectId(userId),
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

    const events = await this.eventModel
      .find({ applicationId: application._id })
      .sort({ occurredAt: 1 })
      .exec();

    return { application, events };
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
