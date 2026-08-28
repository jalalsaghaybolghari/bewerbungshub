import type { InterviewOutcome, InterviewType } from '@bewerber/shared';

export interface Interviewer {
  name: string;
  role?: string;
  email?: string;
}

export interface Interview {
  _id: string;
  applicationId: string;
  round: number;
  type: InterviewType;
  scheduledAt: string;
  durationMinutes?: number;
  interviewers: Interviewer[];
  meetingUrl?: string;
  location?: string;
  outcome: InterviewOutcome;
  prepNotes?: string;
  feedbackNotes?: string;
}
