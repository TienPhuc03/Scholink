import { Passport } from '../passport.entity';
import { Consent } from '../consent.entity';
import { MediaAsset } from '../media-asset.entity';

export const PASSPORT_REPOSITORY = Symbol('PASSPORT_REPOSITORY');

export interface IPassportRepository {
  findByStudentId(studentId: string): Promise<Passport | null>;
  save(passport: Passport): Promise<void>;
  /** With [expectedVersion]: fails with VERSION_MISMATCH if the stored version has moved on. */
  update(passport: Passport, expectedVersion?: number): Promise<void>;
  saveConsent(consent: Consent): Promise<void>;
  findConsentById(consentId: string): Promise<Consent | null>;
  saveMediaAsset(asset: MediaAsset): Promise<void>;
  updateMediaAsset(asset: MediaAsset): Promise<void>;
  findMediaAssetById(assetId: string): Promise<MediaAsset | null>;
  findMediaAssetsByIds(assetIds: readonly string[]): Promise<MediaAsset[]>;
}
