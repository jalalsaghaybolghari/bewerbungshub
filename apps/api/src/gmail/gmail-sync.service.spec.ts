import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { GmailSyncService } from './gmail-sync.service';
import { GmailService } from './gmail.service';
import {
  EmailMatch,
  EmailMatchDocument,
  EmailMatchSchema,
} from './schemas/email-match.schema';
import { UsersService } from '../users/users.service';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import {
  Application,
  ApplicationDocument,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  Event,
  EventDocument,
  EventSchema,
} from '../applications/schemas/event.schema';

jest.setTimeout(60000);

// Only the real external boundary (the Gmail API itself) is mocked — real
// Mongoose behavior (the unique-index dedupe, terminal/pipeline gating
// against real saved Application docs, the Event write) is exercised for
// real via mongodb-memory-server, same convention as
// applications.service.spec.ts.
const mockMessagesList = jest.fn<
  Promise<{ data: { messages?: { id?: string }[]; nextPageToken?: string } }>,
  unknown[]
>();
const mockMessagesGet = jest.fn<
  Promise<{ data: Record<string, unknown> }>,
  unknown[]
>();

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        messages: {
          list: (...args: unknown[]) => mockMessagesList(...args),
          get: (...args: unknown[]) => mockMessagesGet(...args),
        },
      },
    })),
  },
  // gmail_v1 is only used as a type import in gmail-sync.service.ts, but
  // the module still needs the named export present at runtime.
  gmail_v1: {},
}));

function messageHeaders(fromAddress: string, subject: string) {
  return [
    { name: 'From', value: `"Sender" <${fromAddress}>` },
    { name: 'Subject', value: subject },
  ];
}

function textPart(text: string) {
  return {
    mimeType: 'text/plain',
    body: { data: Buffer.from(text, 'utf-8').toString('base64url') },
  };
}

function htmlPart(html: string) {
  return {
    mimeType: 'text/html',
    body: { data: Buffer.from(html, 'utf-8').toString('base64url') },
  };
}

describe('GmailSyncService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: GmailSyncService;
  let userModel: Model<UserDocument>;
  let applicationModel: Model<ApplicationDocument>;
  let eventModel: Model<EventDocument>;
  let emailMatchModel: Model<EmailMatchDocument>;
  let gmailService: { getAuthenticatedClient: jest.Mock };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    gmailService = { getAuthenticatedClient: jest.fn().mockResolvedValue({}) };

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Application.name, schema: ApplicationSchema },
          { name: Event.name, schema: EventSchema },
          { name: EmailMatch.name, schema: EmailMatchSchema },
        ]),
      ],
      providers: [
        GmailSyncService,
        UsersService,
        { provide: GmailService, useValue: gmailService },
      ],
    }).compile();

    service = module.get(GmailSyncService);
    userModel = module.get(getModelToken(User.name));
    applicationModel = module.get(getModelToken(Application.name));
    eventModel = module.get(getModelToken(Event.name));
    emailMatchModel = module.get(getModelToken(EmailMatch.name));
    await emailMatchModel.init();
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}),
      applicationModel.deleteMany({}),
      eventModel.deleteMany({}),
      emailMatchModel.deleteMany({}),
    ]);
    jest.clearAllMocks();
    gmailService.getAuthenticatedClient.mockResolvedValue({});
  });

  async function seedConnectedUser(
    overrides: {
      gmailAutoApprove?: boolean;
      lastSyncedAt?: Date;
    } = {},
  ) {
    return userModel.create({
      email: `user-${new Types.ObjectId().toString()}@example.com`,
      passwordHash: 'irrelevant',
      displayName: 'Test User',
      settings: { gmailAutoApprove: overrides.gmailAutoApprove ?? false },
      gmail: {
        accessTokenEncrypted: 'enc-access',
        refreshTokenEncrypted: 'enc-refresh',
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastSyncedAt: overrides.lastSyncedAt,
        nextSyncAt: new Date(),
        needsReconnect: false,
      },
    });
  }

  async function seedApplication(
    userId: Types.ObjectId,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return applicationModel.create({
      userId,
      jobTitle: 'Backend Engineer',
      company: { name: 'Acme' },
      location: { raw: 'Vienna' },
      jobDescription: 'x',
      applyLink: `https://example.com/${new Types.ObjectId().toString()}`,
      applyType: 'linkedin',
      status: 'applied',
      ...overrides,
    });
  }

  it('searches both the exact-address and the domain-allowlisted senders (regression guard — direct-company ATS emails)', async () => {
    const user = await seedConnectedUser();
    mockMessagesList.mockResolvedValue({ data: { messages: [] } });

    await service.syncUserMailbox(user._id.toString());

    const [callArgs] = mockMessagesList.mock.calls[0] as [{ q: string }];
    expect(callArgs.q).toContain('jobs-noreply@linkedin.com');
    expect(callArgs.q).toContain('@smartrecruiters.com');
    expect(callArgs.q).toContain('@message.digitalrecruiters.com');
    expect(callArgs.q).toContain('@mail.onlyfy.jobs');
    expect(callArgs.q).toContain('@msg.join.com');
    expect(callArgs.q).toContain('@hire.eu.lever.co');
  });

  it("includes a tracked application's company name as a search term (regression guard — direct-company mail with no shared ATS domain, e.g. COUNT IT/REGIUS/Hainzl)", async () => {
    const user = await seedConnectedUser();
    await seedApplication(user._id, { company: { name: 'COUNT IT' } });
    mockMessagesList.mockResolvedValue({ data: { messages: [] } });

    await service.syncUserMailbox(user._id.toString());

    const [callArgs] = mockMessagesList.mock.calls[0] as [{ q: string }];
    expect(callArgs.q).toContain('"COUNT IT"');
  });

  it("excludes a terminal-status application's company name from the search terms (negative case)", async () => {
    const user = await seedConnectedUser();
    await seedApplication(user._id, {
      company: { name: 'Rejected Co' },
      status: 'rejected',
    });
    mockMessagesList.mockResolvedValue({ data: { messages: [] } });

    await service.syncUserMailbox(user._id.toString());

    const [callArgs] = mockMessagesList.mock.calls[0] as [{ q: string }];
    expect(callArgs.q).not.toContain('Rejected Co');
  });

  it('excludes a company name too short to be a useful search term (edge case)', async () => {
    const user = await seedConnectedUser();
    await seedApplication(user._id, { company: { name: 'Ab' } });
    mockMessagesList.mockResolvedValue({ data: { messages: [] } });

    await service.syncUserMailbox(user._id.toString());

    const [callArgs] = mockMessagesList.mock.calls[0] as [{ q: string }];
    expect(callArgs.q).not.toContain('"Ab"');
  });

  it('does nothing when the user has no Gmail connection (edge case)', async () => {
    const user = await userModel.create({
      email: 'no-gmail@example.com',
      passwordHash: 'irrelevant',
      displayName: 'Test User',
    });

    await service.syncUserMailbox(user._id.toString());

    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it('auto-applies a rejection when auto-approve is on (happy path)', async () => {
    const user = await seedConnectedUser({ gmailAutoApprove: true });
    const application = await seedApplication(user._id);
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-1',
        snippet:
          'Unfortunately, we have decided to move forward with other candidates.',
        internalDate: '1700000000000',
        payload: {
          headers: messageHeaders(
            'jobs-noreply@linkedin.com',
            'Update from Acme',
          ),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const updatedApplication = await applicationModel
      .findById(application._id)
      .exec();
    expect(updatedApplication?.status).toBe('rejected');
    expect(updatedApplication?.statusSetBy).toBe('system');

    const events = await eventModel
      .find({ applicationId: application._id })
      .exec();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: 'system',
      type: 'status_changed',
    });

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      decision: 'auto_applied',
      resolvedBy: 'system',
      resolution: 'approved',
      proposedStatus: 'rejected',
    });

    const updatedUser = await userModel.findById(user._id).exec();
    expect(updatedUser?.gmail?.lastSyncStatus).toBe('ok');
    expect(updatedUser?.gmail?.lastSyncedAt).toBeDefined();
    expect(updatedUser?.gmail?.nextSyncAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('queues a rejection for manual approval when auto-approve is off (happy path)', async () => {
    const user = await seedConnectedUser({ gmailAutoApprove: false });
    const application = await seedApplication(user._id);
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        snippet: 'Leider können wir Ihre Bewerbung nicht berücksichtigen.',
        payload: {
          headers: messageHeaders(
            'jobs-noreply@linkedin.com',
            'Ihre Bewerbung bei Acme',
          ),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const updatedApplication = await applicationModel
      .findById(application._id)
      .exec();
    expect(updatedApplication?.status).toBe('applied');

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      decision: 'pending_approval',
      proposedStatus: 'rejected',
    });
  });

  it('records a no_action match when there is no application or classification match (negative case)', async () => {
    const user = await seedConnectedUser();
    await seedApplication(user._id, { company: { name: 'Globex' } });
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        snippet: 'This is not about any job application at all.',
        payload: {
          headers: messageHeaders('jobs-noreply@linkedin.com', 'Newsletter'),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      decision: 'no_action',
      classification: 'none',
    });
  });

  it('skips a message that was already processed in a prior sync (edge case)', async () => {
    const user = await seedConnectedUser();
    await emailMatchModel.create({
      userId: user._id,
      gmailMessageId: 'msg-1',
      fromAddress: 'jobs-noreply@linkedin.com',
      subject: 'Already handled',
      snippet: 'x',
      receivedAt: new Date(),
      classification: 'none',
      decision: 'no_action',
    });
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });

    await service.syncUserMailbox(user._id.toString());

    expect(mockMessagesGet).not.toHaveBeenCalled();
    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches).toHaveLength(1);
  });

  it('walks nextPageToken to fetch more than one page of results (edge case — regression guard for the 100-message truncation bug)', async () => {
    const user = await seedConnectedUser();
    mockMessagesList
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'msg-page-1' }], nextPageToken: 'page-2' },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'msg-page-2' }] } });
    mockMessagesGet.mockResolvedValue({
      data: {
        snippet: 'Just a newsletter, nothing actionable.',
        payload: {
          headers: messageHeaders('jobs-noreply@linkedin.com', 'Newsletter'),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    expect(mockMessagesList).toHaveBeenCalledTimes(2);
    const [secondCallArgs] = mockMessagesList.mock.calls[1] as [
      { pageToken?: string },
    ];
    expect(secondCallArgs).toMatchObject({ pageToken: 'page-2' });
    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches.map((m) => m.gmailMessageId).sort()).toEqual([
      'msg-page-1',
      'msg-page-2',
    ]);
  });

  it('stops paginating at the page cap instead of looping forever on an endless nextPageToken (edge case)', async () => {
    const user = await seedConnectedUser();
    // Every page reports another page available — a real API would never
    // do this forever, but a broken/malicious response could, so the cap
    // (20 pages, matching MAX_LIST_PAGES) is what actually bounds this.
    mockMessagesList.mockImplementation(() =>
      Promise.resolve({
        data: {
          messages: [{ id: `msg-${Math.random()}` }],
          nextPageToken: 'always-more',
        },
      }),
    );
    mockMessagesGet.mockResolvedValue({
      data: {
        snippet: 'Just a newsletter, nothing actionable.',
        payload: {
          headers: messageHeaders('jobs-noreply@linkedin.com', 'Newsletter'),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    expect(mockMessagesList).toHaveBeenCalledTimes(20);
  });

  it("classifies a rejection whose real outcome sentence is beyond what Gmail's snippet would carry (regression guard — the philoro EDELMETALLE bug)", async () => {
    // Reproduces a real production miss: LinkedIn's employer-relay emails
    // echo the subject line, then pad with invisible characters, before
    // the actual "Unfortunately..." sentence — Gmail's own short `snippet`
    // field never reaches it, but the real MIME body (fetched here via
    // format: 'full') does.
    const user = await seedConnectedUser({ gmailAutoApprove: true });
    const application = await seedApplication(user._id, {
      company: { name: 'philoro EDELMETALLE' },
    });
    const combiningGraphemeJoiner = String.fromCharCode(0x034f);
    const fullBody = `Your application to Software Developer at philoro EDELMETALLE${combiningGraphemeJoiner.repeat(80)}Thank you for your interest. Unfortunately, we will not be moving forward with your application, but we appreciate your time.`;
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-1',
        // Mirrors the real bug: Gmail's own snippet is just the echoed
        // subject line, with no rejection keyword in it at all.
        snippet:
          'Your application to Software Developer at philoro EDELMETALLE',
        internalDate: '1700000000000',
        payload: {
          headers: messageHeaders(
            'jobs-noreply@linkedin.com',
            'Your application to Software Developer at philoro EDELMETALLE',
          ),
          parts: [textPart(fullBody)],
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const updatedApplication = await applicationModel
      .findById(application._id)
      .exec();
    expect(updatedApplication?.status).toBe('rejected');

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches[0]).toMatchObject({
      classification: 'rejection',
      decision: 'auto_applied',
    });
    // The stored snippet is the real extracted body text, not Gmail's
    // useless subject-echo snippet.
    expect(matches[0].snippet).toContain('Unfortunately');
  });

  it('classifies a rejection whose real content lives only in the text/html part (regression guard — real LinkedIn email whose text/plain part was footer-only boilerplate)', async () => {
    const user = await seedConnectedUser({ gmailAutoApprove: true });
    const application = await seedApplication(user._id, {
      company: { name: 'philoro EDELMETALLE' },
    });
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-1',
        snippet: 'Your update from philoro EDELMETALLE',
        internalDate: '1700000000000',
        payload: {
          headers: messageHeaders(
            'jobs-noreply@linkedin.com',
            'Your application to Software Developer at philoro EDELMETALLE',
          ),
          parts: [
            // A real footer-only text/plain part — no rejection keyword
            // anywhere in it, same as the actual production email.
            textPart(
              'Learn why we included this. Unsubscribe. Help. LinkedIn Corporation.',
            ),
            htmlPart(
              '<p>Thank you for your interest. Unfortunately, we will not be moving forward with your application.</p>',
            ),
          ],
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const updatedApplication = await applicationModel
      .findById(application._id)
      .exec();
    expect(updatedApplication?.status).toBe('rejected');

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches[0]).toMatchObject({
      classification: 'rejection',
      decision: 'auto_applied',
    });
  });

  it('sets needsReconnect and does not throw on an invalid_grant failure (edge case)', async () => {
    const user = await seedConnectedUser();
    gmailService.getAuthenticatedClient.mockRejectedValue({
      response: { data: { error: 'invalid_grant' } },
    });

    await expect(
      service.syncUserMailbox(user._id.toString()),
    ).resolves.toBeUndefined();

    const updatedUser = await userModel.findById(user._id).exec();
    expect(updatedUser?.gmail?.needsReconnect).toBe(true);
    expect(updatedUser?.gmail?.lastSyncStatus).toBe('error');
  });

  it('records the error and rethrows on any other failure, for BullMQ to retry (negative case)', async () => {
    const user = await seedConnectedUser();
    gmailService.getAuthenticatedClient.mockRejectedValue(
      new Error('network error'),
    );

    await expect(service.syncUserMailbox(user._id.toString())).rejects.toThrow(
      'network error',
    );

    const updatedUser = await userModel.findById(user._id).exec();
    expect(updatedUser?.gmail?.needsReconnect).toBe(false);
    expect(updatedUser?.gmail?.lastSyncStatus).toBe('error');
    expect(updatedUser?.gmail?.lastSyncError).toBe('network error');
  });

  it('never matches (let alone auto-applies) onto an already-terminal application (negative case)', async () => {
    // matchApplication itself already excludes terminal-status candidates
    // (see matching.spec.ts) — this confirms that holds end-to-end through
    // the sync orchestration too, not just at the unit level.
    const user = await seedConnectedUser({ gmailAutoApprove: true });
    const application = await seedApplication(user._id, { status: 'accepted' });
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        snippet: 'We would like to invite you to schedule a call.',
        payload: {
          headers: messageHeaders(
            'jobs-noreply@linkedin.com',
            'Update from Acme',
          ),
        },
      },
    });

    await service.syncUserMailbox(user._id.toString());

    const updatedApplication = await applicationModel
      .findById(application._id)
      .exec();
    expect(updatedApplication?.status).toBe('accepted');

    const matches = await emailMatchModel.find({ userId: user._id }).exec();
    expect(matches[0]).toMatchObject({
      decision: 'no_action',
      applicationId: undefined,
    });
  });
});
