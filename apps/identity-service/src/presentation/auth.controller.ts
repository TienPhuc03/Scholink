import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthUseCase } from '../application/use-cases/auth.use-case';
import {
  RegisterDto,
  RegisterDtoSchema,
  LoginDto,
  LoginDtoSchema,
  RefreshTokenDto,
  RefreshTokenDtoSchema,
} from '../application/dtos/auth.dto';
import { ZodValidationPipe, Public } from '@shared';

@ApiTags('Auth (Identity Microservice)')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authUseCase: AuthUseCase) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản (Email, password, fullName)' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  async register(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) dto: RegisterDto,
  ) {
    return this.authUseCase.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập lấy access token & refresh token' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema)) dto: LoginDto,
  ) {
    return this.authUseCase.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token bằng refresh token' })
  @ApiResponse({ status: 200, description: 'Làm mới token thành công' })
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenDtoSchema)) dto: RefreshTokenDto,
  ) {
    return this.authUseCase.refresh(dto);
  }
}
