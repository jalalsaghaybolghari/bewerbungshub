import { createZodDto } from 'nestjs-zod';
import { updateFollowUpSchema } from '@bewerber/shared';

export class UpdateFollowUpDto extends createZodDto(updateFollowUpSchema) {}
