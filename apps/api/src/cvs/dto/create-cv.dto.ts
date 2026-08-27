import { createZodDto } from 'nestjs-zod';
import { createCvMetadataSchema } from '@bewerber/shared';

export class CreateCvDto extends createZodDto(createCvMetadataSchema) {}
