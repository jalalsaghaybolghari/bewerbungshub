import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  CreateInterviewInput,
  UpdateInterviewInput,
} from '@bewerber/shared';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import { Interview, InterviewDocument } from './schemas/interview.schema';

@Injectable()
export class InterviewsService {
  constructor(
    @InjectModel(Interview.name)
    private readonly interviewModel: Model<InterviewDocument>,
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
  ) {}

  async create(
    userId: string,
    applicationId: string,
    input: CreateInterviewInput,
  ) {
    await this.assertApplicationOwnership(userId, applicationId);
    return this.interviewModel.create({
      ...input,
      applicationId: new Types.ObjectId(applicationId),
      userId: new Types.ObjectId(userId),
    });
  }

  findAllForApplication(applicationId: string) {
    return this.interviewModel
      .find({ applicationId: new Types.ObjectId(applicationId) })
      .sort({ scheduledAt: 1 })
      .exec();
  }

  async update(userId: string, id: string, input: UpdateInterviewInput) {
    const interview = await this.interviewModel
      .findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { $set: input },
        { returnDocument: 'after' },
      )
      .exec();
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.interviewModel
      .deleteOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (result.deletedCount === 0)
      throw new NotFoundException('Interview not found');
  }

  // Used by ApplicationsService.merge — the caller has already validated
  // both applications belong to the requesting user, so no ownership check
  // here.
  async reassignToApplication(
    fromApplicationId: string,
    toApplicationId: string,
  ): Promise<void> {
    await this.interviewModel
      .updateMany(
        { applicationId: new Types.ObjectId(fromApplicationId) },
        { $set: { applicationId: new Types.ObjectId(toApplicationId) } },
      )
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
