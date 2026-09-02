import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: ApplicationQueryDto,
  ) {
    return this.applicationsService.findAllForUser(user.userId, query);
  }

  @Get('check-duplicate')
  checkDuplicate(
    @CurrentUser() user: RequestUser,
    @Query('applyLink') applyLink: string,
  ) {
    return this.applicationsService.checkDuplicate(user.userId, applyLink);
  }

  @Get('duplicate-groups')
  async findDuplicateGroups(@CurrentUser() user: RequestUser) {
    return {
      pairs: await this.applicationsService.findDuplicateGroups(user.userId),
    };
  }

  @Get('check-similar')
  async checkSimilar(
    @CurrentUser() user: RequestUser,
    @Query('jobTitle') jobTitle: string,
    @Query('company') company: string,
  ) {
    return {
      matches: await this.applicationsService.findSimilarApplications(
        user.userId,
        jobTitle,
        company,
      ),
    };
  }

  @Get('stats')
  getStats(@CurrentUser() user: RequestUser) {
    return this.applicationsService.getStats(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.applicationsService.findOneForUser(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(user.userId, id, dto);
  }

  @Post(':id/status')
  changeStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.applicationsService.changeStatus(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.applicationsService.remove(user.userId, id);
  }

  @Post(':keepId/merge/:mergeId')
  merge(
    @CurrentUser() user: RequestUser,
    @Param('keepId') keepId: string,
    @Param('mergeId') mergeId: string,
  ) {
    return this.applicationsService.merge(user.userId, keepId, mergeId);
  }
}
