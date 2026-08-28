import type { FollowUpChannel, FollowUpStatus } from '@bewerber/shared';

export interface FollowUp {
  _id: string;
  applicationId: string;
  dueAt: string;
  sentAt?: string;
  channel: FollowUpChannel;
  messageBody?: string;
  status: FollowUpStatus;
}
