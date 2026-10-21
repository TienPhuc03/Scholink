import { Controller, Get, Put, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PassportUseCase } from '../application/use-cases/passport.use-case';
import {
  UpdatePassportDto,
  UpdatePassportDtoSchema,
  CreateConsentDto,
  CreateConsentDtoSchema,
} from '../application/dtos/passport.dto';
import { ZodValidationPipe, JwtAuthGuard, RolesGuard, Roles, AuthenticatedUser } from '@shared';

@ApiTags('Profile & Passport (Identity Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/profiles')
export class ProfileController {
  constructor(private readonly passportUseCase: PassportUseCase) {}

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Lấy thông tin Passport của sinh viên hiện tại' })
  @ApiResponse({ status: 200, description: 'Lấy Passport thành công' })
  async getMyPassport(@Req() req: { user: AuthenticatedUser }) {
    return this.passportUseCase.getMyPassport(req.user.userId);
  }

  @Put('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Cập nhật Passport sinh viên (tính lại điểm hoàn thiện)' })
  @ApiResponse({ status: 200, description: 'Cập nhật Passport thành công' })
  async updateMyPassport(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(UpdatePassportDtoSchema)) dto: UpdatePassportDto,
  ) {
    return this.passportUseCase.updateMyPassport(req.user.userId, dto);
  }

  @Post('me/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Tạo Consent xác nhận chia sẻ snapshot cho Opportunity' })
  @ApiResponse({ status: 201, description: 'Tạo Consent thành công' })
  async createConsent(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateConsentDtoSchema)) dto: CreateConsentDto,
  ) {
    return this.passportUseCase.createConsent(req.user.userId, dto);
  }
}
