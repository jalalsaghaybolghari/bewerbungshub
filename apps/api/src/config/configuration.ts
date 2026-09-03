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
});
