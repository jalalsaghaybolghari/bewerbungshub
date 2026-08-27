import type { ApplicationStatus, ApplyType, RemoteType } from '@bewerber/shared';

export interface Application {
  _id: string;
  jobTitle: string;
  company: { name: string; website?: string; domain?: string };
  location: { raw: string; city?: string; country?: string; remoteType?: RemoteType };
  jobDescription: string;
  applyLink: string;
  applyType: ApplyType;
  cvId?: string;
  status: ApplicationStatus;
  statusChangedAt: string;
  statusSetBy: 'user' | 'system';
  sentAt?: string;
  tags: string[];
  notes?: string;
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
}
