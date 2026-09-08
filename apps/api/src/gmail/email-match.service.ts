import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  EmailMatch as EmailMatchSummary,
  UnmatchedEmailMatch,
} from '@bewerber/shared';
import { EmailMatch, EmailMatchDocument } from './schemas/email-match.schema';
import { guessCompanyFromSubject } from './company-guess';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import { ApplicationsService } from '../applications/applications.service';

@Injectable()
export class EmailMatchService {
  constructor(
    @InjectModel(EmailMatch.name)
    private readonly emailMatchModel: Model<EmailMatchDocument>,
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    private readonly applicationsService: ApplicationsService,
  ) {}

  // 'decision' is set once at sync time and never changes afterward — an
  // immutable record of what the sync engine decided. resolvedAt/
  // resolvedBy/resolution capture what happened to it later, which is why
  // "still awaiting review" is decision:'pending_approval' AND no
  // resolvedAt yet, not a decision value of its own.
  async findPending(userId: string): Promise<EmailMatchSummary[]> {
    const matches = await this.emailMatchModel
      .find({
        userId: new Types.ObjectId(userId),
        decision: 'pending_approval',
        resolvedAt: { $exists: false },
      })
      .sort({ receivedAt: -1 })
      .lean()
      .exec();
    if (matches.length === 0) return [];

    const applicationIds = matches
      .map((m) => m.applicationId)
      .filter((id): id is Types.ObjectId => !!id);
    const applications = await this.applicationModel
      .find({ _id: { $in: applicationIds } })
      .select('_id jobTitle company.name')
      .lean()
      .exec();
    const applicationById = new Map(
      applications.map((a) => [a._id.toString(), a]),
    );

    return matches
      .filter(
        (m) =>
          m.applicationId &&
          m.proposedStatus &&
          applicationById.has(m.applicationId.toString()),
      )
      .map((m) => {
        const application = applicationById.get(m.applicationId!.toString())!;
        return {
          id: m._id.toString(),
          applicationId: m.applicationId!.toString(),
          applicationTitle: application.jobTitle,
          applicationCompany: application.company.name,
          subject: m.subject,
          snippet: m.snippet,
          gmailThreadId: m.gmailThreadId,
          receivedAt: m.receivedAt,
          classification: m.classification,
          proposedStatus: m.proposedStatus!,
        };
      });
  }

  // A real interview/rejection signal that matchApplication couldn't tie
  // to any application — distinct from the far more common 'no_action'
  // case (classification:'none', sender-matched noise), which is why
  // classification is excluded here rather than just applicationId.
  // Never actionable (there's no application to apply a status to), so
  // this is a read-only list — no approve/reject like findPending's.
  async findUnmatched(userId: string): Promise<UnmatchedEmailMatch[]> {
    const matches = await this.emailMatchModel
      .find({
        userId: new Types.ObjectId(userId),
        applicationId: { $exists: false },
        classification: { $ne: 'none' },
      })
      .sort({ receivedAt: -1 })
      .lean()
      .exec();

    return matches.map((m) => ({
      id: m._id.toString(),
      companyGuess: guessCompanyFromSubject(m.subject),
      subject: m.subject,
      gmailThreadId: m.gmailThreadId,
      receivedAt: m.receivedAt,
      classification: m.classification,
    }));
  }

  // Delegates to the existing ApplicationsService.changeStatus rather than
  // hand-rolling another system-style write — a human clicking Approve is
  // exactly the user-initiated case that method already exists for
  // (correct actor:'user'/statusSetBy:'user' attribution, sentAt
  // handling, audited event, all for free).
  async approve(userId: string, matchId: string): Promise<void> {
    const match = await this.findResolvableMatch(userId, matchId);
    if (!match.applicationId || !match.proposedStatus) {
      throw new ConflictException(
        'This match has no proposed status to approve',
      );
    }

    await this.applicationsService.changeStatus(
      userId,
      match.applicationId.toString(),
      {
        status: match.proposedStatus,
        note: 'Approved from Gmail match',
      },
    );

    match.resolvedAt = new Date();
    match.resolvedBy = 'user';
    match.resolution = 'approved';
    await match.save();
  }

  async reject(userId: string, matchId: string): Promise<void> {
    const match = await this.findResolvableMatch(userId, matchId);

    match.resolvedAt = new Date();
    match.resolvedBy = 'user';
    match.resolution = 'rejected';
    await match.save();
  }

  private async findResolvableMatch(
    userId: string,
    matchId: string,
  ): Promise<EmailMatchDocument> {
    const match = await this.emailMatchModel
      .findOne({ _id: matchId, userId: new Types.ObjectId(userId) })
      .exec();
    if (!match) throw new NotFoundException('Email match not found');
    if (match.decision !== 'pending_approval' || match.resolvedAt) {
      throw new ConflictException('This match has already been resolved');
    }
    return match;
  }
}
