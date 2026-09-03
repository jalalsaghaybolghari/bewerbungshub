import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { GoogleDriveService } from './google-drive.service';

const STATE_PURPOSE = 'google-drive-connect';
const STATE_EXPIRES_IN = '10m';

interface ConnectState {
  sub: string;
  purpose: typeof STATE_PURPOSE;
}

@Controller('google-drive')
export class GoogleDriveController {
  constructor(
    private readonly googleDriveService: GoogleDriveService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@CurrentUser() user: RequestUser) {
    const [connected, connectedAt] = await Promise.all([
      this.googleDriveService.isConnected(user.userId),
      this.googleDriveService.getConnectedAt(user.userId),
    ]);
    return { connected, connectedAt };
  }

  // A plain browser navigation can't carry our Authorization header, so
  // the actual redirect-to-Google step (below) isn't guarded — this route
  // is the Bearer-authenticated half, called via a normal AJAX request,
  // that identifies the user via a short-lived signed `state` instead.
  @Get('connect-url')
  @UseGuards(JwtAuthGuard)
  async connectUrl(@CurrentUser() user: RequestUser) {
    const state = await this.jwtService.signAsync(
      { sub: user.userId, purpose: STATE_PURPOSE } satisfies ConnectState,
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: STATE_EXPIRES_IN,
      },
    );
    return { url: this.googleDriveService.buildAuthUrl(state) };
  }

  // Hit directly by Google's redirect — carries none of our own auth, so
  // `state` (verified below) is the only thing identifying which user is
  // completing the flow. Never guard this with JwtAuthGuard: there is no
  // Bearer header on this request to guard.
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const webAppUrl = this.config.get<string>('webAppUrl');

    if (error || !code || !state) {
      return res.redirect(`${webAppUrl}/cvs?driveError=denied`);
    }

    let payload: ConnectState;
    try {
      payload = await this.jwtService.verifyAsync(state, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      return res.redirect(`${webAppUrl}/cvs?driveError=invalid_state`);
    }
    if (payload.purpose !== STATE_PURPOSE) {
      return res.redirect(`${webAppUrl}/cvs?driveError=invalid_state`);
    }

    try {
      await this.googleDriveService.completeConnection(payload.sub, code);
    } catch {
      return res.redirect(`${webAppUrl}/cvs?driveError=connect_failed`);
    }

    return res.redirect(`${webAppUrl}/cvs?driveConnected=1`);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: RequestUser) {
    await this.googleDriveService.disconnect(user.userId);
  }
}
