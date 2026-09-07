import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { GmailSyncService } from './gmail-sync.service';

interface GmailSyncJobData {
  userId: string;
}

// Thin on purpose — all real logic lives in GmailSyncService.syncUserMailbox,
// which is directly unit-testable without a real BullMQ worker. Retries
// (attempts/backoff) are configured on the job itself by
// GmailSyncDispatcherService, not here.
@Injectable()
@Processor('gmail-sync')
export class GmailSyncProcessor extends WorkerHost {
  constructor(private readonly syncService: GmailSyncService) {
    super();
  }

  async process(job: Job<GmailSyncJobData>): Promise<void> {
    await this.syncService.syncUserMailbox(job.data.userId);
  }
}
