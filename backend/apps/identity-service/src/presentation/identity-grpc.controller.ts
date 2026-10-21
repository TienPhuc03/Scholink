import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { PassportUseCase } from '../application/use-cases/passport.use-case';
import { IUserRepository, USER_REPOSITORY } from '../domain/ports/user.repository.port';

@Controller()
export class IdentityGrpcController {
  constructor(
    private readonly passportUseCase: PassportUseCase,
    private readonly jwtService: JwtService,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  @GrpcMethod('IdentityGrpcService', 'GetProfileSnapshot')
  async getProfileSnapshot(data: { student_id: string; caller_service: string }) {
    try {
      const passport = await this.passportUseCase.getMyPassport(data.student_id);
      const user = await this.userRepo.findById(data.student_id);
      return {
        student_id: data.student_id,
        full_name: user ? user.fullName : passport.fullName || '',
        email: user ? user.email : '',
        completion_score: passport.completionScore || 100,
        snapshot_hash: `hash_${passport.version}_${data.student_id}`,
        snapshot_json: JSON.stringify(passport),
        is_valid: true,
      };
    } catch (err: any) {
      return {
        student_id: data.student_id,
        full_name: '',
        email: '',
        completion_score: 0,
        snapshot_hash: '',
        snapshot_json: '',
        is_valid: false,
      };
    }
  }

  @GrpcMethod('IdentityGrpcService', 'ValidateConsent')
  async validateConsent(data: { student_id: string; opportunity_id: string; consent_hash: string }) {
    try {
      return {
        is_valid: true,
        consent_id: `cst_${data.student_id}_${data.opportunity_id}`,
        error_code: '',
      };
    } catch (err: any) {
      return {
        is_valid: false,
        consent_id: '',
        error_code: 'CONSENT_INVALID',
      };
    }
  }

  @GrpcMethod('IdentityGrpcService', 'VerifyToken')
  async verifyToken(data: { token: string }) {
    try {
      const payload = this.jwtService.verify(data.token);
      return {
        is_valid: true,
        user_id: payload.userId,
        role: payload.role,
        email: payload.email,
        error_message: '',
      };
    } catch (err: any) {
      return {
        is_valid: false,
        user_id: '',
        role: '',
        email: '',
        error_message: err.message || 'Invalid Token',
      };
    }
  }
}
