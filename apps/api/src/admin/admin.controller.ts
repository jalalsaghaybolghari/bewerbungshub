import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.adminService.deleteUser(user.userId, id);
  }

  @Post('users/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  approveUser(@Param('id') id: string) {
    return this.adminService.approveUser(id);
  }

  @Post('users/:id/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  lockUser(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.adminService.setUserLocked(user.userId, id, true);
  }

  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlockUser(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.adminService.setUserLocked(user.userId, id, false);
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateAdminSettingsDto) {
    return this.adminService.updateSettings(dto);
  }
}
