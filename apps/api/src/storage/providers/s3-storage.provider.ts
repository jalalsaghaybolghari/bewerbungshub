import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from '../storage.service';

@Injectable()
export class S3StorageProvider extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.get<string>('storage.s3.bucket')!;
    this.client = new S3Client({
      endpoint: config.get<string>('storage.s3.endpoint'),
      region: config.get<string>('storage.s3.region'),
      forcePathStyle: config.get<boolean>('storage.s3.forcePathStyle'),
      credentials: {
        accessKeyId: config.get<string>('storage.s3.accessKeyId')!,
        secretAccessKey: config.get<string>('storage.s3.secretAccessKey')!,
      },
    });
  }

  async save(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getDownloadUrl(key: string): Promise<string | null> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: 300 });
  }
}
