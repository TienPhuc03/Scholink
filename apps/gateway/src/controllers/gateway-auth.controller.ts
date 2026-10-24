import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  ZodValidationPipe,
  Public,
  JwtAuthGuard,
  AuthenticatedUser,
  RegisterDto,
  RegisterDtoSchema,
  LoginDto,
  LoginDtoSchema,
  RefreshTokenDto,
  RefreshTokenDtoSchema,
  SendOtpDto,
  SendOtpDtoSchema,
  VerifyOtpDto,
  VerifyOtpDtoSchema,
  ForgotPasswordDto,
  ForgotPasswordDtoSchema,
  ResetPasswordDto,
  ResetPasswordDtoSchema,
} from '@shared';
import { GATEWAY_IDENTITY_GRPC, IdentityGrpcClient } from '../grpc-clients.interface';

@ApiTags('Auth (Identity Service)')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/auth')
export class GatewayAuthController implements OnModuleInit {
  private identityService!: IdentityGrpcClient;

  constructor(@Inject(GATEWAY_IDENTITY_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.identityService = this.client.getService<IdentityGrpcClient>('IdentityGrpcService');
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản sinh viên qua gRPC Identity Service' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student.test@scholink.edu.vn' },
        password: { type: 'string', example: 'Student@2026' },
        fullName: { type: 'string', example: 'Nguyễn Văn Sinh Viên' },
      },
      required: ['email', 'password', 'fullName'],
    },
  })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công (Role mặc định STUDENT từ server)' })
  async register(@Body(new ZodValidationPipe(RegisterDtoSchema)) dto: RegisterDto) {
    return firstValueFrom(this.identityService.register(dto));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập lấy Access Token & Refresh Token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student@scholink.edu.vn' },
        password: { type: 'string', example: 'Student@2026' },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  async login(@Body(new ZodValidationPipe(LoginDtoSchema)) dto: LoginDto) {
    return firstValueFrom(this.identityService.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xoay vòng Refresh Token (chống Replay theo Token Family)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({ status: 200, description: 'Làm mới token thành công' })
  async refresh(@Body(new ZodValidationPipe(RefreshTokenDtoSchema)) dto: RefreshTokenDto) {
    return firstValueFrom(this.identityService.refresh(dto));
  }

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'FR-AUTH-02: Gửi mã OTP 6 chữ số tới email (TTL 5p, cooldown 60s, băm SHA-256)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student@scholink.edu.vn' },
        purpose: {
          type: 'string',
          enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'],
          example: 'VERIFY_EMAIL',
        },
      },
      required: ['email'],
    },
  })
  @ApiResponse({ status: 200, description: 'Đã phát hành mã OTP' })
  async sendOtp(@Body(new ZodValidationPipe(SendOtpDtoSchema)) dto: SendOtpDto) {
    return firstValueFrom(this.identityService.sendOtp(dto));
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'FR-AUTH-02: Xác thực mã OTP 6 chữ số (nhập sai 5 lần khóa 15 phút)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student@scholink.edu.vn' },
        otpCode: { type: 'string', example: '123456' },
        purpose: {
          type: 'string',
          enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'],
          example: 'VERIFY_EMAIL',
        },
      },
      required: ['email', 'otpCode'],
    },
  })
  @ApiResponse({ status: 200, description: 'Xác thực OTP thành công' })
  async verifyOtp(@Body(new ZodValidationPipe(VerifyOtpDtoSchema)) dto: VerifyOtpDto) {
    return firstValueFrom(this.identityService.verifyOtp(dto));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'FR-AUTH-03: Yêu cầu OTP đặt lại mật khẩu (chống dò email / Anti-Enumeration)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student@scholink.edu.vn' },
      },
      required: ['email'],
    },
  })
  @ApiResponse({ status: 200, description: 'Đã xử lý yêu cầu đặt lại mật khẩu' })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordDtoSchema)) dto: ForgotPasswordDto,
  ) {
    return firstValueFrom(this.identityService.forgotPassword(dto));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'FR-AUTH-03 & FR-AUTH-04: Đặt lại mật khẩu bằng OTP và thu hồi toàn bộ phiên cũ',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'student@scholink.edu.vn' },
        otpCode: { type: 'string', example: '123456' },
        newPassword: { type: 'string', example: 'NewStudentPass@2026' },
      },
      required: ['email', 'otpCode', 'newPassword'],
    },
  })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công, các phiên cũ đã bị thu hồi' })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordDtoSchema)) dto: ResetPasswordDto,
  ) {
    return firstValueFrom(this.identityService.resetPassword(dto));
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất và thu hồi phiên hiện tại' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(@Req() req: { user: AuthenticatedUser }) {
    return firstValueFrom(
      this.identityService.logout({
        userId: req.user.userId,
        sessionId: req.user.sessionId || '',
      }),
    );
  }
}
