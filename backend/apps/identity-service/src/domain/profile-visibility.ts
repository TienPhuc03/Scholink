import { Passport, Certificate } from './passport.entity';

/**
 * FR-PROF-05: per-field visibility of a Passport.
 * - PRIVATE: only the owner;
 * - TEAMMATES: the owner and members of a team they belong to;
 * - PUBLIC: any signed-in user.
 * Full name and avatar are always visible so people can recognise each other in teams and lists.
 * Applications are not filtered here: the consented snapshot is the grant (see getProfileSnapshot).
 */
export type FieldVisibility = 'PRIVATE' | 'TEAMMATES' | 'PUBLIC';
export type ProfileAudience = 'PUBLIC' | 'TEAMMATES';

export const FIELD_VISIBILITIES: readonly FieldVisibility[] = ['PRIVATE', 'TEAMMATES', 'PUBLIC'];

export const PRIVACY_FIELDS = [
  'email',
  'phone',
  'bio',
  'regionCode',
  'skills',
  'education',
  'certificates',
  'achievements',
  'cv',
  'pitchVideo',
] as const;

export type PrivacyField = (typeof PRIVACY_FIELDS)[number];
export type FieldPrivacy = Readonly<Record<PrivacyField, FieldVisibility>>;

/** Contact details stay private unless the student opens them (SRS FR-PROF-05). */
export const DEFAULT_FIELD_PRIVACY: FieldPrivacy = Object.freeze({
  email: 'PRIVATE',
  phone: 'PRIVATE',
  bio: 'PUBLIC',
  regionCode: 'PUBLIC',
  skills: 'PUBLIC',
  education: 'TEAMMATES',
  certificates: 'TEAMMATES',
  achievements: 'TEAMMATES',
  cv: 'TEAMMATES',
  pitchVideo: 'TEAMMATES',
});

const isVisibility = (v: unknown): v is FieldVisibility =>
  typeof v === 'string' && (FIELD_VISIBILITIES as readonly string[]).includes(v);

const isPrivacyField = (k: string): k is PrivacyField => (PRIVACY_FIELDS as readonly string[]).includes(k);

/** Stored settings over the defaults; unknown keys and invalid values are ignored. */
export const resolveFieldPrivacy = (stored?: Readonly<Record<string, unknown>> | null): FieldPrivacy => {
  const resolved: Record<PrivacyField, FieldVisibility> = { ...DEFAULT_FIELD_PRIVACY };
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (isPrivacyField(key) && isVisibility(value)) resolved[key] = value;
  }
  return Object.freeze(resolved);
};

/** Returns the invalid keys/values of an update, empty when it is valid. */
export const invalidPrivacyEntries = (update: Readonly<Record<string, unknown>>): string[] =>
  Object.entries(update)
    .filter(([key, value]) => !isPrivacyField(key) || !isVisibility(value))
    .map(([key]) => key);

export const isVisibleTo = (visibility: FieldVisibility, audience: ProfileAudience): boolean =>
  audience === 'PUBLIC' ? visibility === 'PUBLIC' : visibility !== 'PRIVATE';

export interface ProfileContact {
  readonly email?: string;
  readonly phone?: string;
}

/** The Passport as seen by [audience]: fields that are not granted are left out entirely. */
export const buildProfileView = (passport: Passport, contact: ProfileContact, audience: ProfileAudience) => {
  const p = passport.props;
  const privacy = resolveFieldPrivacy(p.fieldPrivacy);
  const can = (field: PrivacyField) => isVisibleTo(privacy[field], audience);
  const visibleFields = PRIVACY_FIELDS.filter(can);

  return Object.freeze({
    studentId: p.studentId,
    fullName: p.fullName,
    avatarAssetId: p.avatarAssetId ?? '',
    audience,
    visibleFields,
    ...(can('email') && contact.email ? { email: contact.email } : {}),
    ...(can('phone') && contact.phone ? { phone: contact.phone } : {}),
    ...(can('bio') && p.bio ? { bio: p.bio } : {}),
    ...(can('regionCode') && p.regionCode ? { regionCode: p.regionCode } : {}),
    ...(can('skills') ? { skills: [...(p.skills ?? [])] } : {}),
    ...(can('education') && p.education ? { education: { ...p.education } } : {}),
    ...(can('certificates')
      ? {
          certificates: (p.certificates ?? []).map((c: Certificate) => ({
            ...c,
            issuedDate: new Date(c.issuedDate).toISOString(),
            expiryDate: c.expiryDate ? new Date(c.expiryDate).toISOString() : undefined,
          })),
        }
      : {}),
    ...(can('achievements') ? { achievements: [...(p.achievements ?? [])] } : {}),
    ...(can('cv') && p.cvAssetId ? { cvAssetId: p.cvAssetId } : {}),
    ...(can('pitchVideo') && p.pitchVideoAssetId ? { pitchVideoAssetId: p.pitchVideoAssetId } : {}),
  });
};
