import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ALLOWED_CV_MIME_TYPES,
  MAX_CV_SIZE_BYTES,
  CreateCvMetadataInput,
  UpdateCvInput,
} from '@bewerber/shared';
import { StorageService } from '../storage/storage.service';
import { Cv, CvDocument } from './schemas/cv.schema';

@Injectable()
export class CvsService {
  constructor(
    @InjectModel(Cv.name) private readonly cvModel: Model<CvDocument>,
    private readonly storage: StorageService,
  ) {}

  findAllForUser(userId: string) {
    return this.cvModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOneForUser(userId: string, id: string): Promise<CvDocument> {
    const cv = await this.cvModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (!cv) throw new NotFoundException('CV not found');
    return cv;
  }

  async create(
    userId: string,
    metadata: CreateCvMetadataInput,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<CvDocument> {
    if (
      !ALLOWED_CV_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_CV_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Only PDF is accepted.`,
      );
    }
    if (file.size > MAX_CV_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${MAX_CV_SIZE_BYTES / (1024 * 1024)} MB limit`,
      );
    }

    const fileKey = `cvs/${userId}/${randomUUID()}.pdf`;
    await this.storage.save(fileKey, file.buffer, file.mimetype);

    if (metadata.isDefault) {
      await this.cvModel
        .updateMany(
          { userId: new Types.ObjectId(userId) },
          { isDefault: false },
        )
        .exec();
    }

    return this.cvModel.create({
      userId: new Types.ObjectId(userId),
      label: metadata.label,
      language: metadata.language,
      fileKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      isDefault: metadata.isDefault,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCvInput,
  ): Promise<CvDocument> {
    const cv = await this.findOneForUser(userId, id);

    if (input.isDefault) {
      await this.cvModel
        .updateMany(
          { userId: cv.userId, _id: { $ne: cv._id } },
          { isDefault: false },
        )
        .exec();
    }
    if (input.label !== undefined) cv.label = input.label;
    if (input.isDefault !== undefined) cv.isDefault = input.isDefault;
    await cv.save();
    return cv;
  }

  async remove(userId: string, id: string): Promise<void> {
    const cv = await this.findOneForUser(userId, id);
    await this.storage.delete(cv.fileKey);
    await cv.deleteOne();
  }

  async getFile(
    userId: string,
    id: string,
  ): Promise<{
    url: string | null;
    buffer: Buffer | null;
    mimeType: string;
    fileName: string;
  }> {
    const cv = await this.findOneForUser(userId, id);
    const url = await this.storage.getDownloadUrl(cv.fileKey);
    const buffer = url ? null : await this.storage.read(cv.fileKey);
    return { url, buffer, mimeType: cv.mimeType, fileName: cv.fileName };
  }
}
