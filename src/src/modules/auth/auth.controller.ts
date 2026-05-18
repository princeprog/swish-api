import { Controller, Get, Post, Body, Res, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthGuard } from './auth.guard';
import type { Response } from 'express';
import { CreateAccountFromInviteDto } from './dto/create-account-from-invite.dto';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  async login(@Body() body: { username: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(body.username, body.password);
    return this.authService.login(user, res);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    return this.authService.refreshSession(refreshToken, res);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    const userId = req.user.sub;
    return this.authService.getProfile(userId);
  }

  @Post('create-account-from-invite')
  async createAccountFromInvite(
    @Body() dto: CreateAccountFromInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.createAccountFromInvite(dto, res);
  }
}

