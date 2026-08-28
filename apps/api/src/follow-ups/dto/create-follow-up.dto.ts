import { createZodDto } from 'nestjs-zod';
import { createFollowUpSchema } from '@bewerber/shared';

export class CreateFollowUpDto extends createZodDto(createFollowUpSchema) {}
