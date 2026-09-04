import type { ApplicationStatus, ApplyType, RemoteType } from '@bewerber/shared';
import type { Interview } from '../interviews/types';
import type { FollowUp } from '../follow-ups/types';

export interface Application {
  _id: string;
  jobTitle: string;
  company: { name: string; website?: string; domain?: string };
  location: { raw: string; city?: string; country?: string; remoteType?: RemoteType };
  jobDescription: string;
  applyLink: string;
  applyType: ApplyType;
  sourceUrl?: string;
  cvId?: string;
  status: ApplicationStatus;
  statusChangedAt: string;
  statusSetBy: 'user' | 'system';
  sentAt?: string;
  postedAt?: string;
  nextFollowUpAt?: string;
  followUpCount: number;
  tags: string[];
  notes?: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  _id: string;
  applicationId: string;
  type: 'created' | 'status_changed' | 'note';
  occurredAt: string;
  actor: 'user' | 'system';
  payload?: Record<string, unknown>;
}

export interface ApplicationsListResponse {
  items: Application[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApplicationDetailResponse {
  application: Application;
  events: ApplicationEvent[];
  interviews: Interview[];
  followUps: FollowUp[];
}

export interface OverdueFollowUpApplication {
  _id: string;
  jobTitle: string;
  company: { name: string };
  nextFollowUpAt: string;
}

export interface ApplicationStats {
  total: number;
  sentThisWeek: number;
  responseRate: number;
  avgDaysToFirstResponse: number | null;
  byStatus: Partial<Record<ApplicationStatus, number>>;
  byApplyType: Partial<Record<ApplyType, number>>;
  overdueFollowUps: OverdueFollowUpApplication[];
}

export interface DuplicatePair {
  a: Application;
  b: Application;
  titleSimilarity: number;
  companySimilarity: number;
  locationSimilarity: number;
}

export interface DuplicateGroupsResponse {
  pairs: DuplicatePair[];
}
