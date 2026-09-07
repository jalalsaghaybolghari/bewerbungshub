import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class GmailSyncDispatcherService {
  private readonly logger = new Logger(GmailSyncDispatcherService.name);

  constructor(
    @InjectQueue('gmail-sync') private readonly queue: Queue,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // Ticks well inside the smallest user-selectable interval (15m) so no
  // connected user waits meaningfully longer than they chose.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    const count = await this.enqueueDueUsers();
    if (count > 0) this.logger.log(`Enqueued ${count} Gmail sync job(s)`);
  }

  // Public (not private) so tests can call the real due-user query and
  // enqueue logic directly, same split as
  // ApplicationsCronService.markGhostedApplications() vs. its own
  // @Cron-decorated handleCron().
  async enqueueDueUsers(): Promise<number> {
    const dueUsers = await this.userModel
      .find({
        'gmail.needsReconnect': false,
        'gmail.nextSyncAt': { $lte: new Date() },
      })
      .select('_id')
      .lean()
      .exec();

    for (const user of dueUsers) {
      const userId = user._id.toString();
      // jobId = userId makes a duplicate enqueue a natural no-op — BullMQ
      // skips adding a job when one with that id is still
      // waiting/active/delayed, which is exactly "don't re-sync a user
      // whose previous sync hasn't finished yet."
      await this.queue.add(
        'sync',
        { userId },
        {
          jobId: userId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }

    return dueUsers.length;
  }
}
