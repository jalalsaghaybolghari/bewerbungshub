export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri:
    process.env.MONGO_URI ??
    'mongodb://localhost:27017/bewerbermanagementsystem',
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    refreshCookieMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
  },
  mail: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.MAIL_FROM ?? 'BewerbungsHub <onboarding@resend.dev>',
  },
  storage: {
    // 'local' needs no external service — files land under storage.localDir.
    // 's3' talks to any S3-compatible endpoint (MinIO locally, real S3/R2/Azure Blob in prod).
    // 'google-drive' is per-user, opted into per-CV — see cvs.storageProvider,
    // not selected here the way local/s3 are.
    driver:
      (process.env.STORAGE_DRIVER as 'local' | 's3' | undefined) ?? 'local',
    localDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      bucket: process.env.S3_BUCKET ?? 'bewerbermanagementsystem',
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
    },
  },
  googleDrive: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  },
  gmail: {
    // Reuses the Drive OAuth client by default — Google scopes a client at
    // authorization time, not creation time, so one client with two
    // registered redirect URIs (Drive's callback + Gmail's) works fine.
    // Set GMAIL_OAUTH_CLIENT_ID/SECRET explicitly to use a dedicated one.
    clientId:
      process.env.GMAIL_OAUTH_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret:
      process.env.GMAIL_OAUTH_CLIENT_SECRET ??
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  // Where the Google Drive OAuth callback (and anything else that needs to
  // land the browser back in the web app) redirects to after finishing.
  webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:5173',
  security: {
    // 64 hex chars = 32 bytes, required by TokenEncryptionService (AES-256).
    // Dev-only fallback, same "insecure but works out of the box" spirit
    // as the JWT secrets above — real deployments must set a random one:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '0'.repeat(64),
  },
});
