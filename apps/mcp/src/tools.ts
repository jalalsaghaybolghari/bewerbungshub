import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applicationStatusValues } from '@bewerber/shared';
import { BewerbungsHubApiError, bewerbungsHubFetch } from './bewerbungshub-client';

interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): ToolTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolTextResult {
  const message =
    error instanceof BewerbungsHubApiError || error instanceof Error
      ? error.message
      : 'Unknown error';
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function buildQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

interface ListApplicationsArgs {
  status?: (typeof applicationStatusValues)[number];
  favorite?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function makeListApplicationsHandler(authHeader: string | undefined) {
  return async ({ status, favorite, q, page, pageSize }: ListApplicationsArgs) => {
    try {
      const query = buildQueryString({
        status,
        favorite: favorite === undefined ? undefined : String(favorite),
        q,
        page: page === undefined ? undefined : String(page),
        pageSize: pageSize === undefined ? undefined : String(pageSize),
      });
      const data = await bewerbungsHubFetch(authHeader, `/applications${query}`);
      return ok(data);
    } catch (error) {
      return fail(error);
    }
  };
}

export function makeGetApplicationHandler(authHeader: string | undefined) {
  return async ({ id }: { id: string }) => {
    try {
      const data = await bewerbungsHubFetch(authHeader, `/applications/${encodeURIComponent(id)}`);
      return ok(data);
    } catch (error) {
      return fail(error);
    }
  };
}

// Registered fresh for every incoming MCP request (see main.ts) — authHeader
// is whatever bearer token the caller sent, closed over here so every tool
// call in this request forwards the same credentials without needing any
// server-side session or credential storage of its own.
export function registerTools(server: McpServer, authHeader: string | undefined): void {
  server.registerTool(
    'list_applications',
    {
      title: 'List job applications',
      description:
        "List the caller's own job applications, optionally filtered by status, favorite, or a text search across title/company/tags.",
      inputSchema: {
        status: z.enum(applicationStatusValues).optional().describe('Filter by pipeline status'),
        favorite: z.boolean().optional().describe('Only return favorited applications'),
        q: z.string().max(200).optional().describe('Search job title, company name, or tags'),
        page: z.number().int().min(1).optional().describe('Page number (1-based), default 1'),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Results per page, default 20'),
      },
    },
    makeListApplicationsHandler(authHeader),
  );

  server.registerTool(
    'get_application',
    {
      title: 'Get a job application',
      description:
        "Get full details for one of the caller's own job applications by id, including its status timeline, interviews, and follow-ups.",
      inputSchema: {
        id: z.string().min(1).describe('The application id'),
      },
    },
    makeGetApplicationHandler(authHeader),
  );
}
