import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Application, ApplicationDocument } from './schemas/application.schema';
import { Event, EventDocument } from './schemas/event.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

// Statuses where "no update in a while" plausibly means the employer went
// quiet. `draft` hasn't been sent; `offer` means they *did* respond; the
// terminal statuses are already resolved — none of those are "ghosted".
const GHOSTABLE_STATUSES = [
  'applied',
  'acknowledged',
  'screening',
  'interview',
] as const;

@Injectable()
export class ApplicationsCronService {
  private readonly logger = new Logger(ApplicationsCronService.name);

  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron(): Promise<void> {
    const count = await this.markGhostedApplications();
    if (count > 0)
      this.logger.log(`Auto-marked ${count} application(s) as ghosted`);
  }

  /**
   * Marks applications ghosted once they've sat in a "waiting to hear back"
   * status for longer than the owning user's `ghostedAfterDays` setting,
   * using each user's own threshold. Public (not private) so tests and the
   * daily cron both call the same real logic.
   */
  async markGhostedApplications(): Promise<number> {
    const users = await this.userModel
      .find()
      .select('_id settings')
      .lean()
      .exec();
    let totalMarked = 0;

    for (const user of users) {
      const ghostedAfterDays = user.settings?.ghostedAfterDays ?? 21;
      const threshold = new Date(
        Date.now() - ghostedAfterDays * 24 * 60 * 60 * 1000,
      );

      const stale = await this.applicationModel
        .find({
          userId: user._id,
          status: { $in: GHOSTABLE_STATUSES },
          statusChangedAt: { $lt: threshold },
        })
        .exec();

      for (const application of stale) {
        const from = application.status;
        application.status = 'ghosted';
        application.statusChangedAt = new Date();
        application.statusSetBy = 'system';
        await application.save();

        await this.eventModel.create({
          applicationId: application._id,
          userId: user._id,
          type: 'status_changed',
          actor: 'system',
          occurredAt: new Date(),
          payload: {
            from,
            to: 'ghosted',
            reason: `no update in ${ghostedAfterDays}+ days`,
          },
        });
        totalMarked += 1;
      }
    }

    return totalMarked;
  }
}
