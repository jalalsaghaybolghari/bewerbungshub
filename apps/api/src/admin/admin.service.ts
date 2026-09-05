import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  AdminSettings,
  AdminStats,
  AdminUsersListResponse,
  AdminUsersQuery,
} from '@bewerber/shared';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import { Cv, CvDocument } from '../cvs/schemas/cv.schema';
import { Event, EventDocument } from '../applications/schemas/event.schema';
import { UsersService } from '../users/users.service';
import { CvsService } from '../cvs/cvs.service';
import { InterviewsService } from '../interviews/interviews.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { AuthService } from '../auth/auth.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Cv.name) private readonly cvModel: Model<CvDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    private readonly usersService: UsersService,
    private readonly cvsService: CvsService,
    private readonly interviewsService: InterviewsService,
    private readonly followUpsService: FollowUpsService,
    private readonly authService: AuthService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async listUsers(query: AdminUsersQuery): Promise<AdminUsersListResponse> {
    const skip = (query.page - 1) * query.pageSize;
    const filter = query.approvalStatus
      ? { approvalStatus: query.approvalStatus }
      : {};
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.pageSize)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const items = await Promise.all(
      users.map(async (user) => {
        const [applicationCount, cvCount] = await Promise.all([
          this.applicationModel.countDocuments({ userId: user._id }).exec(),
          this.cvModel.countDocuments({ userId: user._id }).exec(),
        ]);
        return {
          id: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          locale: user.locale,
          emailVerified: user.emailVerified,
          isAdmin: user.isAdmin,
          isLocked: user.isLocked,
          approvalStatus: user.approvalStatus,
          hasApiKey: !!user.apiKeyHash,
          createdAt: user.get('createdAt') as Date,
          applicationCount,
          cvCount,
        };
      }),
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getStats(): Promise<AdminStats> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      verifiedUsers,
      adminUsers,
      totalApplications,
      totalCvs,
      newUsersLast7Days,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel.countDocuments({ emailVerified: true }).exec(),
      this.userModel.countDocuments({ isAdmin: true }).exec(),
      // Excludes soft-deleted (archived) applications, same convention
      // as ApplicationsService.getStats's own baseFilter.
      this.applicationModel
        .countDocuments({ archivedAt: { $exists: false } })
        .exec(),
      this.cvModel.countDocuments().exec(),
      this.userModel.countDocuments({ createdAt: { $gte: weekAgo } }).exec(),
    ]);

    return {
      totalUsers,
      verifiedUsers,
      adminUsers,
      totalApplications,
      totalCvs,
      newUsersLast7Days,
    };
  }

  // Cascade order matters and is deliberate — see the comments at each
  // step. No transactions are available (standalone MongoDB, no replica
  // set), so this is a sequence of plain awaits, same risk this codebase
  // already accepts in ApplicationsService.merge.
  async deleteUser(
    requestingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    if (requestingUserId === targetUserId) {
      throw new ForbiddenException(
        'Cannot delete your own account from the admin panel',
      );
    }

    const target = await this.userModel.findById(targetUserId).exec();
    if (!target) throw new NotFoundException('User not found');

    // CVs first, while the User document still exists — Google Drive
    // cleanup needs to look the user up to build an authenticated client.
    await this.cvsService.removeAllForUser(targetUserId);
    await this.interviewsService.removeAllForUser(targetUserId);
    await this.followUpsService.removeAllForUser(targetUserId);
    await this.eventModel.deleteMany({ userId: target._id }).exec();
    // No archivedAt filter here — a cascade delete removes everything,
    // archived or not, unlike the user-facing "delete one application".
    await this.applicationModel.deleteMany({ userId: target._id }).exec();
    // Last, and only once every other collection is clean, so a
    // mid-cascade failure leaves the user still visible (and retryable)
    // in the admin list rather than orphaned data with no owner.
    await this.usersService.deleteById(targetUserId);
  }

  // Delegates to AuthService.approveAndSendCode rather than reaching into
  // UsersService/MailService directly, so there's exactly one place that
  // knows how to move a pending account to approved and send its code.
  approveUser(targetUserId: string): Promise<void> {
    return this.authService.approveAndSendCode(targetUserId);
  }

  async setUserLocked(
    requestingUserId: string,
    targetUserId: string,
    locked: boolean,
  ): Promise<void> {
    if (requestingUserId === targetUserId) {
      throw new ForbiddenException(
        'Cannot lock or unlock your own account from the admin panel',
      );
    }

    const target = await this.userModel.findById(targetUserId).exec();
    if (!target) throw new NotFoundException('User not found');

    await this.usersService.setLocked(targetUserId, locked);
    // Kills any active session immediately on lock, rather than waiting
    // for its own natural rotation — no equivalent teardown needed on
    // unlock, since there's nothing to revoke.
    if (locked) {
      await this.usersService.setRefreshTokenHash(targetUserId, undefined);
    }
  }

  async getSettings(): Promise<AdminSettings> {
    const autoApproveRegistrations =
      await this.systemSettingsService.getAutoApprove();
    return { autoApproveRegistrations };
  }

  async updateSettings(settings: AdminSettings): Promise<AdminSettings> {
    await this.systemSettingsService.setAutoApprove(
      settings.autoApproveRegistrations,
    );
    return settings;
  }
}
