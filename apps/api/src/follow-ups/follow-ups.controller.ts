import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FollowUpsService } from './follow-ups.service';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post('applications/:applicationId/follow-ups')
  create(
    @CurrentUser() user: RequestUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.followUpsService.create(user.userId, applicationId, dto);
  }

  @Patch('follow-ups/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    return this.followUpsService.update(user.userId, id, dto);
  }

  @Delete('follow-ups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.followUpsService.remove(user.userId, id);
  }
}
