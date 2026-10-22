import { Passport } from '../passport.entity';
import { Consent } from '../consent.entity';

export const PASSPORT_REPOSITORY = Symbol('PASSPORT_REPOSITORY');

export interface IPassportRepository {
  findByStudentId(studentId: string): Promise<Passport | null>;
  save(passport: Passport): Promise<void>;
  update(passport: Passport): Promise<void>;
  saveConsent(consent: Consent): Promise<void>;
  findConsentById(consentId: string): Promise<Consent | null>;
}
