import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  CreateFollowUpInput,
  UpdateFollowUpInput,
} from '@bewerber/shared';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import { FollowUp, FollowUpDocument } from './schemas/follow-up.schema';

@Injectable()
export class FollowUpsService {
  constructor(
    @InjectModel(FollowUp.name)
    private readonly followUpModel: Model<FollowUpDocument>,
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
  ) {}

  async create(
    userId: string,
    applicationId: string,
    input: CreateFollowUpInput,
  ) {
    await this.assertApplicationOwnership(userId, applicationId);
    const followUp = await this.followUpModel.create({
      ...input,
      applicationId: new Types.ObjectId(applicationId),
      userId: new Types.ObjectId(userId),
    });
    await this.recomputeNextFollowUp(applicationId);
    return followUp;
  }

  findAllForApplication(applicationId: string) {
    return this.followUpModel
      .find({ applicationId: new Types.ObjectId(applicationId) })
      .sort({ dueAt: 1 })
      .exec();
  }

  async update(userId: string, id: string, input: UpdateFollowUpInput) {
    const existing = await this.followUpModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!existing) throw new NotFoundException('Follow-up not found');

    const justSent = input.status === 'sent' && existing.status !== 'sent';

    Object.assign(existing, input);
    if (justSent && !existing.sentAt) existing.sentAt = new Date();
    await existing.save();

    await this.recomputeNextFollowUp(existing.applicationId.toString());
    if (justSent) {
      await this.applicationModel
        .updateOne(
          { _id: existing.applicationId },
          { $inc: { followUpCount: 1 } },
        )
        .exec();
    }

    return existing;
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.followUpModel
      .findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!existing) throw new NotFoundException('Follow-up not found');
    await this.recomputeNextFollowUp(existing.applicationId.toString());
  }

  // Used by ApplicationsService.merge — the caller has already validated
  // both applications belong to the requesting user, so no ownership check
  // here. Recomputes the target's nextFollowUpAt afterward, since moved-in
  // follow-ups can change what the soonest scheduled one is.
  async reassignToApplication(
    fromApplicationId: string,
    toApplicationId: string,
  ): Promise<void> {
    await this.followUpModel
      .updateMany(
        { applicationId: new Types.ObjectId(fromApplicationId) },
        { $set: { applicationId: new Types.ObjectId(toApplicationId) } },
      )
      .exec();
    await this.recomputeNextFollowUp(toApplicationId);
  }

  /** Keeps Application.nextFollowUpAt in sync with the soonest still-scheduled follow-up. */
  private async recomputeNextFollowUp(applicationId: string): Promise<void> {
    const next = await this.followUpModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        status: 'scheduled',
      })
      .sort({ dueAt: 1 })
      .exec();

    await this.applicationModel
      .updateOne(
        { _id: applicationId },
        next
          ? { $set: { nextFollowUpAt: next.dueAt } }
          : { $unset: { nextFollowUpAt: '' } },
      )
      .exec();
  }

  // Used only by AdminService.deleteUser's cascade — no need to
  // recomputeNextFollowUp per application here, since every application for
  // this user is deleted right after this in the same cascade.
  async removeAllForUser(userId: string): Promise<void> {
    await this.followUpModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  private async assertApplicationOwnership(
    userId: string,
    applicationId: string,
  ): Promise<void> {
    const exists = await this.applicationModel
      .exists({ _id: applicationId, userId: new Types.ObjectId(userId) })
      .exec();
    if (!exists) throw new NotFoundException('Application not found');
  }
}
