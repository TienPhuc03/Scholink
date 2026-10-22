import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OpportunityUseCase } from '../application/use-cases/opportunity.use-case';
import { CreateOpportunityDto, QueryOpportunityDto } from '../application/dtos/opportunity.dto';
import { GrpcExceptionFilter } from '@shared';

@UseFilters(GrpcExceptionFilter)
@Controller()
export class OpportunityController {
  constructor(private readonly opportunityUseCase: OpportunityUseCase) {}

  @GrpcMethod('OpportunityGrpcService', 'ListOpportunities')
  async list(query: QueryOpportunityDto) {
    return this.opportunityUseCase.list(query);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetOpportunityById')
  async getById(data: { id: string }) {
    return this.opportunityUseCase.getById(data.id);
  }

  @GrpcMethod('OpportunityGrpcService', 'CreateOpportunity')
  async create(
    data: CreateOpportunityDto & { actorId: string; organizationId?: string },
  ) {
    const { actorId, organizationId, ...dto } = data;
    return this.opportunityUseCase.create(dto, actorId, organizationId);
  }
}
