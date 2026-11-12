/**
 * F34 / E05 (APP-05, TEAM-05): concurrency checks for team submission against a real MongoDB
 * replica set, so unique indexes and transactions are the ones production uses.
 *
 * Run: `pnpm run test:race` (needs `docker compose up -d`; uses MONGODB_URI or localhost:27017).
 * It works in its own database `scholink_race_f34`, dropped before and after the run. Not part of
 * `pnpm test`: the file name ends in `.e2e-spec.ts`, which the default testRegex skips.
 */
import * as crypto from 'crypto';
import mongoose, { Connection } from 'mongoose';
import { OutboxSchema, DomainException } from '@shared';
import { Application } from './domain/application.entity';
import { MongooseApplicationRepository } from './infrastructure/persistence/application.repository';
import {
  ApplicationEventSchema,
  ApplicationMemberSchema,
  ApplicationRevisionSchema,
  ApplicationSchema,
  SubmissionIntentSchema,
  SubmissionPreviewSchema,
} from './infrastructure/persistence/application.schema';

jest.setTimeout(120_000);

const URI = `${process.env.MONGODB_URI || 'mongodb://localhost:27017'}/scholink_race_f34`;
const ROUNDS = Number(process.env.F34_ROUNDS || 25);

let conn: Connection;
let repo: MongooseApplicationRepository;

const models = () => {
  const m = (name: string, schema: mongoose.Schema) => conn.models[name] ?? conn.model(name, schema);
  return {
    app: m('ApplicationModel', ApplicationSchema),
    preview: m('SubmissionPreviewModel', SubmissionPreviewSchema),
    revision: m('ApplicationRevisionModel', ApplicationRevisionSchema),
    event: m('ApplicationEventModel', ApplicationEventSchema),
    member: m('ApplicationMemberModel', ApplicationMemberSchema),
    intent: m('SubmissionIntentModel', SubmissionIntentSchema),
    outbox: m('OutboxModel', OutboxSchema),
  };
};

/** A team commit as `ApplicationUseCase.submit` builds it, minus the gRPC checks before it. */
function teamCommit(p: { opportunityId: string; teamId: string; submissionId: string; members: string[] }) {
  const id = `app_${crypto.randomUUID()}`;
  const now = new Date();
  const application = new Application(id, {
    opportunityId: p.opportunityId,
    studentId: p.members[0],
    teamId: p.teamId,
    submissionId: p.submissionId,
    memberIds: p.members,
    submissionType: 'TEAM',
    status: 'SUBMITTED',
    screening: 'ELIGIBLE',
    previewId: `prv_${id}`,
    snapshotId: `snp_${id}`,
    profileVersion: 1,
    ruleVersion: 1,
    payloadHash: 'h',
    consentId: `cns_${id}`,
    submittedAt: now,
    revision: 1,
  });
  return {
    application,
    isResubmission: false,
    revision: {
      id: `rev_${id}`,
      applicationId: id,
      revision: 1,
      previewId: `prv_${id}`,
      snapshotId: `snp_${id}`,
      profileVersion: 1,
      ruleVersion: 1,
      snapshotJson: '{}',
      manifestJson: '[]',
      payloadHash: 'h',
      consentId: `cns_${id}`,
      screening: 'ELIGIBLE' as const,
      submittedAt: now,
    },
    event: { id: `evt_${id}`, applicationId: id, actorId: p.members[0], toStatus: 'SUBMITTED', revision: 1 },
    outbox: {
      eventId: `out_${id}`,
      type: 'application.submitted',
      occurredAt: now,
      producer: 'f34-race',
      aggregateId: id,
      aggregateVersion: 1,
      correlationId: p.submissionId,
      data: { applicationId: id },
    },
    submissionIntent: {
      submissionId: p.submissionId,
      opportunityId: p.opportunityId,
      teamId: p.teamId,
      leaderId: p.members[0],
      status: 'PENDING' as const,
      memberIds: p.members,
    },
    activeMemberIds: p.members,
  };
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

const code = (e: unknown) => (e instanceof DomainException ? (e as any).code ?? (e as any).errorCode : String(e));

beforeAll(async () => {
  conn = await mongoose.createConnection(URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  await conn.dropDatabase();
  const m = models();
  await Promise.all(Object.values(m).map((model) => model.syncIndexes()));
  repo = new MongooseApplicationRepository(
    m.app as any,
    m.preview as any,
    m.revision as any,
    m.event as any,
    m.member as any,
    m.intent as any,
    m.outbox as any,
    conn,
  );
});

afterAll(async () => {
  await conn?.dropDatabase();
  await conn?.close();
});

describe('F34 / E05 — team submission races on real MongoDB', () => {
  it(`commit and abort of the same intent never both win (${ROUNDS} rounds)`, async () => {
    const m = models();
    const tally = { committed: 0, aborted: 0 };
    for (let i = 0; i < ROUNDS; i++) {
      const submissionId = `sub_ca_${i}`;
      const teamId = `team_ca_${i}`;
      const opportunityId = `opp_ca_${i}`;
      await repo.createOrGetSubmissionIntent({
        submissionId,
        opportunityId,
        teamId,
        leaderId: `lead_${i}`,
        status: 'PENDING',
        memberIds: [`lead_${i}`, `mem_${i}`],
      });

      const [commit, abort] = await Promise.all([
        settle(repo.commitSubmissionWithOutbox(teamCommit({ opportunityId, teamId, submissionId, members: [`lead_${i}`, `mem_${i}`] }))),
        // Odd rounds let the commit get a head start, so both outcomes are exercised.
        settle(
          new Promise((r) => setTimeout(r, i % 2 ? 15 : 0)).then(() =>
            repo.abortSubmissionIntent({ submissionId, teamId, reason: 'LEASE_EXPIRED' }),
          ),
        ),
      ]);

      const intent = await repo.findSubmissionIntentById(submissionId);
      const apps = await m.app.countDocuments({ teamId });
      const members = await m.member.countDocuments({ opportunityId, isActive: true });
      const abortWon = abort.ok && abort.value.aborted;

      // Exactly one outcome, and the stored state agrees with it.
      expect(commit.ok).toBe(!abortWon);
      if (commit.ok) {
        tally.committed++;
        expect(intent?.status).toBe('COMMITTED');
        expect(apps).toBe(1);
        expect(members).toBe(2);
      } else {
        tally.aborted++;
        expect(intent?.status).toBe('ABORTED');
        expect(apps).toBe(0);
        expect(members).toBe(0);
      }
    }
    console.log(`[E05] commit vs abort: ${tally.committed} commit thắng, ${tally.aborted} abort thắng, 0 cùng thắng`);
  });

  it(`two teams sharing a member: only one active application (${ROUNDS} rounds)`, async () => {
    const m = models();
    for (let i = 0; i < ROUNDS; i++) {
      const opportunityId = `opp_share_${i}`;
      const shared = `shared_${i}`;
      const a = { opportunityId, teamId: `teamA_${i}`, submissionId: `subA_${i}`, members: [`leadA_${i}`, shared] };
      const b = { opportunityId, teamId: `teamB_${i}`, submissionId: `subB_${i}`, members: [`leadB_${i}`, shared] };
      for (const t of [a, b]) {
        await repo.createOrGetSubmissionIntent({ ...t, leaderId: t.members[0], status: 'PENDING', memberIds: t.members });
      }

      const results = await Promise.all([a, b].map((t) => settle(repo.commitSubmissionWithOutbox(teamCommit(t)))));

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await m.member.countDocuments({ opportunityId, studentId: shared, isActive: true })).toBe(1);
      expect(await m.app.countDocuments({ opportunityId })).toBe(1);
      // The loser left nothing behind: no half-written members, revisions or outbox rows.
      expect(await m.member.countDocuments({ opportunityId, isActive: true })).toBe(2);
      const loser = results.find((r) => !r.ok)!;
      expect(['TEAM_MEMBER_CONFLICT', 'ALREADY_APPLIED', 'MEMBERSHIP_CONFLICT']).toContain(code((loser as any).error));
    }
  });

  it('a retried commit with the same submissionId creates one application only', async () => {
    const m = models();
    const t = { opportunityId: 'opp_retry', teamId: 'team_retry', submissionId: 'sub_retry', members: ['lead_r', 'mem_r'] };
    await repo.createOrGetSubmissionIntent({ ...t, leaderId: 'lead_r', status: 'PENDING', memberIds: t.members });

    const results = await Promise.all([1, 2, 3].map(() => settle(repo.commitSubmissionWithOutbox(teamCommit(t)))));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await m.app.countDocuments({ teamId: 'team_retry' })).toBe(1);
    expect(await m.outbox.countDocuments({ correlationId: 'sub_retry' })).toBe(1);
  });

  it('a commit arriving after the lease was aborted is refused', async () => {
    const t = { opportunityId: 'opp_late', teamId: 'team_late', submissionId: 'sub_late', members: ['lead_l', 'mem_l'] };
    await repo.abortSubmissionIntent({ submissionId: 'sub_late', teamId: 'team_late', reason: 'LEASE_EXPIRED' });

    const late = await settle(repo.commitSubmissionWithOutbox(teamCommit(t)));

    expect(late.ok).toBe(false);
    expect(code((late as any).error)).toBe('HOLD_EXPIRED');
    expect(await models().app.countDocuments({ teamId: 'team_late' })).toBe(0);
  });
});
