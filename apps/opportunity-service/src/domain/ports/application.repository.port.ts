import { Application } from '../application.entity';

export interface IApplicationRepository {
  findById(id: string): Promise<Application | null>;
  findByOpportunityAndStudent(opportunityId: string, studentId: string): Promise<Application | null>;
  findManyByStudent(studentId: string): Promise<Application[]>;
  findManyByOpportunity(opportunityId: string): Promise<Application[]>;
  save(application: Application): Promise<void>;
  update(application: Application): Promise<void>;
}

export const APPLICATION_REPOSITORY = 'APPLICATION_REPOSITORY';
