import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools';

const PORT = Number(process.env.PORT ?? 3002);

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Stateless: a fresh McpServer + transport per request, matching the MCP
// SDK's own recommended pattern for a server with no need to push
// server-initiated notifications between calls. This also means the
// caller's bearer token (see registerTools) never outlives a single
// request — nothing is cached or kept across calls.
app.post('/mcp', async (req: Request, res: Response) => {
  const server = new McpServer({ name: 'bewerbungshub', version: '1.0.0' });
  registerTools(server, req.headers.authorization);

  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

app.listen(PORT, () => {
  console.log(`BewerbungsHub MCP server listening on port ${PORT}`);
});
