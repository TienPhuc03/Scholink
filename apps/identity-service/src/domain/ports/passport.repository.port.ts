import { Passport } from '../passport.entity';

export interface IPassportRepository {
  findByStudentId(studentId: string): Promise<Passport | null>;
  save(passport: Passport): Promise<void>;
  update(passport: Passport): Promise<void>;
}

export const PASSPORT_REPOSITORY = 'PASSPORT_REPOSITORY';
