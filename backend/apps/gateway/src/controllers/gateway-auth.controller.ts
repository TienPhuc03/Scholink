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
