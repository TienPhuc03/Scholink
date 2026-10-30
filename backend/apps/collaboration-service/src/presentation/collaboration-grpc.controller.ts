import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { TeamUseCase } from '../application/use-cases/team.use-case';
import { ChatUseCase } from '../application/use-cases/chat.use-case';

@Controller()
export class CollaborationGrpcController {
  constructor(
    private readonly teamUseCase: TeamUseCase,
    private readonly chatUseCase: ChatUseCase,
  ) {}

  @GrpcMethod('CollaborationGrpcService', 'PrepareSubmission')
  async prepareSubmission(data: { team_id: string; leader_id: string; competition_id: string; payload_hash: string }) {
    try {
      const result = await this.teamUseCase.prepareSubmission(data.team_id, data.leader_id);
      return {
        success: true,
        reservation_id: result.reservationId,
        fencing_token: result.fencingToken,
        lease_expires_at: new Date(result.leaseExpiresAt).getTime(),
        message: 'Roster freeze activated successfully',
      };
    } catch (err: any) {
      return {
        success: false,
        reservation_id: '',
        fencing_token: 0,
        lease_expires_at: 0,
        message: err.message || 'Prepare submission failed',
      };
    }
  }

  @GrpcMethod('CollaborationGrpcService', 'ValidateReservation')
  async validateReservation(data: { team_id: string; fencing_token: number }) {
    const result = await this.teamUseCase.validateReservation(data.team_id, Number(data.fencing_token));
    return {
      is_valid: result.isValid,
      status: result.status,
      error_code: result.errorCode,
    };
  }

  @GrpcMethod('CollaborationGrpcService', 'ConfirmSubmission')
  async confirmSubmission(data: { team_id: string; reservation_id: string; fencing_token: number }) {
    try {
      const result = await this.teamUseCase.confirmSubmission(data.reservation_id);
      return {
        success: true,
        status: result.status,
        message: 'Submission confirmed and team status updated',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        message: err.message,
      };
    }
  }

  @GrpcMethod('CollaborationGrpcService', 'AbortSubmission')
  async abortSubmission(data: { team_id: string; reservation_id: string; fencing_token: number; reason: string }) {
    try {
      const result = await this.teamUseCase.abortSubmission(data.reservation_id);
      return {
        success: true,
        message: `Submission aborted. Reason: ${data.reason}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  @GrpcMethod('CollaborationGrpcService', 'SendChatMessage')
  async sendChatMessage(data: {
    room_id: string;
    sender_id: string;
    sender_name: string;
    client_msg_id: string;
    content: string;
    type: string;
  }) {
    const result = await this.chatUseCase.sendMessage(
      data.room_id,
      data.sender_id,
      {
        clientMsgId: data.client_msg_id,
        content: data.content,
      },
    );

    return {
      message_id: result.id,
      room_id: result.roomId,
      seq: result.seq,
      client_msg_id: result.clientMsgId || '',
      content: result.content,
      created_at: result.createdAt ? new Date(result.createdAt).getTime() : Date.now(),
      is_duplicate: false,
    };
  }

  @GrpcMethod('CollaborationGrpcService', 'GetTeamDetails')
  async getTeamDetails(data: { team_id: string }) {
    const team = await this.teamUseCase.getTeamById(data.team_id);
    return {
      team_id: team.id,
      name: team.name,
      competition_id: team.competitionId,
      leader_id: team.leaderId,
      status: team.status,
      max_members: team.maxSize,
      members: (team.members || []).map((m: any) => ({
        student_id: m.studentId,
        role: m.role,
        status: 'ACTIVE',
      })),
    };
  }
}
