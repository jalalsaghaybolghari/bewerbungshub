import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google, gmail_v1 } from 'googleapis';
import type {
  ApplicationStatus,
  EmailMatchClassification,
} from '@bewerber/shared';
import { GmailService } from './gmail.service';
import { EmailMatch, EmailMatchDocument } from './schemas/email-match.schema';
import {
  SENDER_ALLOWLIST,
  SENDER_DOMAIN_ALLOWLIST,
  extractSenderAddress,
  extractSenderDisplayName,
} from './sender-allowlist';
import { classifyEmail } from './classification';
import { cleanEmailText, extractPlainText } from './body-text';
import { matchApplication, type MatchCandidate } from './matching';
import { decideOutcome } from './decision';
import { UsersService } from '../users/users.service';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import { Event, EventDocument } from '../applications/schemas/event.schema';

// Bounds the very first sync's search window for a newly-connected user —
// lastSyncedAt is unset until a sync actually completes.
const GMAIL_BACKFILL_DAYS = 90;

// messages.list returns at most 100 ids per page and, left unpaginated,
// silently truncates — the bug this constant exists to fix: a mailbox
// with more than 100 matching messages in the search window only ever
// got the newest 100, and since the next sync's `after:` bound moves
// forward regardless, anything beyond that first page was gone for good.
// Walking nextPageToken fixes that; this just bounds how many pages one
// sync will walk (2000 messages) so a pathological backlog can't turn a
// single sync into an unbounded loop — logged if ever hit, since at that
// scale the remaining backlog needs a second look, not a silent drop.
const MAX_LIST_PAGES = 20;

// Gmail's from: operator accepts a bare `@domain` term to match any
// sender at that (sub)domain — used for SENDER_DOMAIN_ALLOWLIST since
// several of those senders vary their local-part per application.
function buildSearchQuery(after: Date): string {
  const senderTerms = [
    ...SENDER_ALLOWLIST,
    ...SENDER_DOMAIN_ALLOWLIST.map((domain) => `@${domain}`),
  ];
  return `from:(${senderTerms.join(' OR ')}) after:${Math.floor(after.getTime() / 1000)}`;
}

// Google's node client surfaces a revoked/expired refresh token as a 400
// with this error code in the response body — distinct from every other
// failure mode (network, rate limit, 5xx) because retrying it can never
// succeed without the user reconnecting.
function isInvalidGrantError(err: unknown): boolean {
  const data = (err as { response?: { data?: { error?: string } } })?.response
    ?.data;
  return data?.error === 'invalid_grant';
}

@Injectable()
export class GmailSyncService {
  private readonly logger = new Logger(GmailSyncService.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly usersService: UsersService,
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(EmailMatch.name)
    private readonly emailMatchModel: Model<EmailMatchDocument>,
  ) {}

  // Public and DB-mutating, called by GmailSyncProcessor — kept separate
  // from the processor itself so it's directly unit-testable without a
  // real BullMQ worker, same split as
  // ApplicationsCronService.markGhostedApplications() vs. its own
  // @Cron-decorated dispatcher method.
  async syncUserMailbox(userId: string): Promise<void> {
    const startedAt = new Date();
    const user = await this.usersService.findById(userId);
    // Disconnected between being enqueued and now — nothing to do.
    if (!user?.gmail) return;

    const intervalMinutes = user.settings.gmailSyncIntervalMinutes;
    const nextSyncAt = new Date(Date.now() + intervalMinutes * 60_000);

    try {
      const client = await this.gmailService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth: client });

      const after =
        user.gmail.lastSyncedAt ??
        new Date(
          user.gmail.connectedAt.getTime() -
            GMAIL_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
        );

      const messageIds = await this.listAllMessageIds(gmail, after);

      if (messageIds.length > 0) {
        const alreadyProcessed = await this.emailMatchModel
          .find({ userId: user._id, gmailMessageId: { $in: messageIds } })
          .select('gmailMessageId')
          .lean()
          .exec();
        const processed = new Set(
          alreadyProcessed.map((m) => m.gmailMessageId),
        );
        const newIds = messageIds.filter((id) => !processed.has(id));

        for (const id of newIds) {
          await this.processMessage(
            user._id,
            user.settings.gmailAutoApprove,
            gmail,
            id,
          );
        }
      }

      await this.usersService.recordGmailSyncResult(userId, {
        nextSyncAt,
        lastSyncedAt: startedAt,
        status: 'ok',
        needsReconnect: false,
      });
    } catch (err) {
      const needsReconnect = isInvalidGrantError(err);
      this.logger.warn(
        `Gmail sync failed for user ${userId}${needsReconnect ? ' (needs reconnect)' : ''}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.usersService.recordGmailSyncResult(userId, {
        nextSyncAt,
        lastSyncedAt: startedAt,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        needsReconnect,
      });
      // A revoked/expired token will never succeed on retry — let the job
      // complete rather than burn BullMQ's attempts budget on it.
      if (needsReconnect) return;
      throw err;
    }
  }

  // See the comment on MAX_LIST_PAGES for why this exists — a single
  // unpaginated messages.list() call silently truncates to 100 results.
  private async listAllMessageIds(
    gmail: gmail_v1.Gmail,
    after: Date,
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const result = await gmail.users.messages.list({
        userId: 'me',
        q: buildSearchQuery(after),
        pageToken,
      });
      ids.push(
        ...(result.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => !!id),
      );
      pageToken = result.data.nextPageToken ?? undefined;
      pages += 1;
    } while (pageToken && pages < MAX_LIST_PAGES);

    if (pageToken) {
      this.logger.warn(
        `Gmail sync hit the ${MAX_LIST_PAGES}-page cap (${ids.length} messages) — some older matching messages in this window were not fetched this run.`,
      );
    }

    return ids;
  }

  private async processMessage(
    userId: Types.ObjectId,
    autoApproveEnabled: boolean,
    gmail: gmail_v1.Gmail,
    messageId: string,
  ): Promise<void> {
    // format: 'full' (not 'metadata') is required to reach the real MIME
    // body — Gmail's own `snippet` field is a short auto-generated preview
    // that some senders' emails (LinkedIn's employer-relay messages,
    // confirmed in production) defeat with invisible-character padding
    // right after the subject-echoing first line, so the actual outcome
    // sentence (e.g. a rejection) never reaches it. See body-text.ts.
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = message.data.payload?.headers ?? [];
    const fromHeader = headers.find((h) => h.name === 'From')?.value ?? '';
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const bodyText = cleanEmailText(extractPlainText(message.data.payload));
    // Falls back to Gmail's own snippet only when body extraction found no
    // usable text at all (e.g. an unusual MIME structure) — otherwise the
    // real body always wins over the short, potentially-truncated snippet.
    const snippet = bodyText || (message.data.snippet ?? '');
    const receivedAt = message.data.internalDate
      ? new Date(Number(message.data.internalDate))
      : new Date();

    const baseRecord = {
      userId,
      gmailMessageId: messageId,
      gmailThreadId: message.data.threadId ?? undefined,
      fromAddress: extractSenderAddress(fromHeader),
      subject,
      snippet,
      receivedAt,
    };

    const applications = await this.applicationModel
      .find({ userId })
      .select('_id company.name status')
      .lean()
      .exec();
    const candidates: MatchCandidate[] = applications.map((a) => ({
      id: a._id.toString(),
      companyName: a.company.name,
      status: a.status,
    }));

    const applicationId = matchApplication(
      candidates,
      subject,
      snippet,
      extractSenderDisplayName(fromHeader),
    );
    const classification = classifyEmail(subject, snippet);

    if (!applicationId || classification === 'none') {
      await this.emailMatchModel.create({
        ...baseRecord,
        applicationId: applicationId ?? undefined,
        classification,
        decision: 'no_action',
      });
      return;
    }

    const matchedApplication = applications.find(
      (a) => a._id.toString() === applicationId,
    );
    // Shouldn't happen (matchApplication only returns ids from the same
    // candidates list) — defensive, since a deleted-mid-sync application
    // isn't worth failing the whole sync over.
    if (!matchedApplication) return;

    const decision = decideOutcome(
      matchedApplication.status,
      classification,
      autoApproveEnabled,
    );

    if (decision.action === 'auto' && decision.proposedStatus) {
      const eventId = await this.applyAutoStatusChange(
        userId,
        applicationId,
        decision.proposedStatus,
        classification,
      );
      await this.emailMatchModel.create({
        ...baseRecord,
        applicationId,
        classification,
        decision: 'auto_applied',
        proposedStatus: decision.proposedStatus,
        resolvedAt: new Date(),
        resolvedBy: 'system',
        resolution: 'approved',
        eventId,
      });
      return;
    }

    await this.emailMatchModel.create({
      ...baseRecord,
      applicationId,
      classification,
      decision: 'pending_approval',
      proposedStatus: decision.proposedStatus,
    });
  }

  // Mirrors ApplicationsCronService.markGhostedApplications()'s direct
  // mutation + event-write pattern for a system-driven status change —
  // deliberately not ApplicationsService.changeStatus, which hardcodes
  // actor:'user' and is reserved for the human-approve path
  // (EmailMatchService.approve).
  private async applyAutoStatusChange(
    userId: Types.ObjectId,
    applicationId: string,
    proposedStatus: ApplicationStatus,
    classification: EmailMatchClassification,
  ): Promise<Types.ObjectId | undefined> {
    const application = await this.applicationModel
      .findOne({ _id: applicationId, userId })
      .exec();
    if (!application) return undefined;

    const from = application.status;
    application.status = proposedStatus;
    application.statusChangedAt = new Date();
    application.statusSetBy = 'system';
    // Same backfill rule as ApplicationsService.changeStatus — a rejection
    // can in principle land on an application that never left 'draft'.
    if (!application.sentAt && proposedStatus !== 'draft') {
      application.sentAt = new Date();
    }
    await application.save();

    const event = await this.eventModel.create({
      applicationId: application._id,
      userId,
      type: 'status_changed',
      actor: 'system',
      occurredAt: new Date(),
      payload: {
        from,
        to: proposedStatus,
        reason: `gmail-auto: ${classification}`,
      },
    });

    return event._id;
  }
}
