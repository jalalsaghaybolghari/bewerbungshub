import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google, gmail_v1 } from 'googleapis';
import type {
  ApplicationStatus,
  EmailMatchClassification,
} from '@bewerber/shared';
import { terminalApplicationStatuses } from '@bewerber/shared';
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

// Below this, a company name is too generic to trust as a Gmail search
// term (mirrors matching.ts's own substring-match guard) — including it
// would just inflate fetch volume with irrelevant mail, never anything
// this sync could actually act on.
const MIN_COMPANY_SEARCH_TERM_LENGTH = 3;
// Bounds how many company-name OR terms one sync's search query carries —
// a pathologically long list of tracked applications shouldn't produce an
// unbounded (or Gmail-rejected) query string. Logged if ever hit.
const MAX_COMPANY_SEARCH_TERMS = 50;

// Gmail's from: operator accepts a bare `@domain` term to match any
// sender at that (sub)domain — used for SENDER_DOMAIN_ALLOWLIST since
// several of those senders vary their local-part per application.
//
// The sender allowlist alone only ever covers shared ATS platforms
// (join.com, SmartRecruiters, Lever, ...) — real direct-company rejection
// emails (confirmed repeatedly in production: COUNT IT, KERN, REGIUS,
// Hainzl, each sent from that company's own one-off mail domain) can
// never be enumerated as a static list, since there's no bound on which
// companies a user might apply to. Instead, the search also OR's in a
// quoted term for each of the user's own tracked, non-terminal
// applications' company names — this is what actually gates relevance
// (matchApplication/classifyEmail still have to agree afterward for
// anything to surface), so it scales with the one thing that's already
// bounded per user: their own application list, not a global registry of
// every possible employer's mail domain.
function buildSearchQuery(after: Date, companyNames: string[]): string {
  const senderTerms = [
    ...SENDER_ALLOWLIST,
    ...SENDER_DOMAIN_ALLOWLIST.map((domain) => `@${domain}`),
  ];
  const companyTerms = companyNames.map(
    (name) => `"${name.replace(/"/g, '')}"`,
  );
  const clauses = [`from:(${senderTerms.join(' OR ')})`, ...companyTerms];
  return `(${clauses.join(' OR ')}) after:${Math.floor(after.getTime() / 1000)}`;
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

      // Fetched once per sync (not once per message, as before) — also
      // what the search query's company-name terms are built from below.
      const applications = await this.applicationModel
        .find({ userId: user._id })
        .select('_id company.name status')
        .lean()
        .exec();
      const candidates: MatchCandidate[] = applications.map((a) => ({
        id: a._id.toString(),
        companyName: a.company.name,
        status: a.status,
      }));
      const companyNames = candidates
        .filter(
          (c) =>
            !terminalApplicationStatuses.includes(
              c.status as (typeof terminalApplicationStatuses)[number],
            ),
        )
        .map((c) => c.companyName.trim())
        .filter((name) => name.length >= MIN_COMPANY_SEARCH_TERM_LENGTH);
      if (companyNames.length > MAX_COMPANY_SEARCH_TERMS) {
        this.logger.warn(
          `User ${userId} has ${companyNames.length} non-terminal applications — capping this sync's search to the first ${MAX_COMPANY_SEARCH_TERMS} company names.`,
        );
      }

      const messageIds = await this.listAllMessageIds(
        gmail,
        after,
        companyNames.slice(0, MAX_COMPANY_SEARCH_TERMS),
      );

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
            candidates,
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
    companyNames: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    const query = buildSearchQuery(after, companyNames);

    do {
      const result = await gmail.users.messages.list({
        userId: 'me',
        q: query,
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
    candidates: MatchCandidate[],
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

    const matchedApplication = candidates.find((c) => c.id === applicationId);
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
