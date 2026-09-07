import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { GmailSyncDispatcherService } from './gmail-sync-dispatcher.service';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';

jest.setTimeout(60000);

// bullmq's Queue tries to talk to a real Redis connection as soon as it's
// constructed — BullModule.registerQueue would need one running for this
// spec. Only the due-user query (real Mongoose behavior) is what's worth
// testing with a real database; the Queue itself is mocked, same
// reasoning as mocking the Gmail API client in gmail-sync.service.spec.ts.
function makeQueueMock() {
  return { add: jest.fn() };
}

describe('GmailSyncDispatcherService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: GmailSyncDispatcherService;
  let userModel: Model<UserDocument>;
  let queue: ReturnType<typeof makeQueueMock>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    queue = makeQueueMock();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
      ],
      providers: [
        GmailSyncDispatcherService,
        { provide: getQueueToken('gmail-sync'), useValue: queue },
      ],
    }).compile();

    service = module.get(GmailSyncDispatcherService);
    userModel = module.get(getModelToken(User.name));
  });

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    jest.clearAllMocks();
  });

  async function seedUser(gmail?: Partial<Record<string, unknown>>) {
    return userModel.create({
      email: `user-${Math.random()}@example.com`,
      passwordHash: 'irrelevant',
      displayName: 'Test User',
      gmail,
    });
  }

  it('enqueues a job for a user whose nextSyncAt is due (happy path)', async () => {
    const user = await seedUser({
      accessTokenEncrypted: 'x',
      refreshTokenEncrypted: 'x',
      accessTokenExpiresAt: new Date(),
      connectedAt: new Date(),
      nextSyncAt: new Date(Date.now() - 60_000),
      needsReconnect: false,
    });

    const count = await service.enqueueDueUsers();

    expect(count).toBe(1);
    expect(queue.add).toHaveBeenCalledWith(
      'sync',
      { userId: user._id.toString() },
      expect.objectContaining({ jobId: user._id.toString() }),
    );
  });

  it('does not enqueue a user whose nextSyncAt is still in the future (negative case)', async () => {
    await seedUser({
      accessTokenEncrypted: 'x',
      refreshTokenEncrypted: 'x',
      accessTokenExpiresAt: new Date(),
      connectedAt: new Date(),
      nextSyncAt: new Date(Date.now() + 60_000),
      needsReconnect: false,
    });

    const count = await service.enqueueDueUsers();

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue a user who needs to reconnect, even if otherwise due (edge case)', async () => {
    await seedUser({
      accessTokenEncrypted: 'x',
      refreshTokenEncrypted: 'x',
      accessTokenExpiresAt: new Date(),
      connectedAt: new Date(),
      nextSyncAt: new Date(Date.now() - 60_000),
      needsReconnect: true,
    });

    const count = await service.enqueueDueUsers();

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue a user with no Gmail connection at all (negative case)', async () => {
    await seedUser();

    const count = await service.enqueueDueUsers();

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
