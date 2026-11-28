import { OpportunityUseCase } from './opportunity.use-case';
import { IOpportunityRepository, OpportunityFilter } from '../../domain/ports/opportunity.repository.port';
import { Opportunity } from '../../domain/opportunity.entity';

/** Only the filters suggestCompetition / mySuggestions use. */
class MemoryRepo implements IOpportunityRepository {
  items: Opportunity[] = [];
  async findById(id: string) {
    return this.items.find((o) => o.id === id) ?? null;
  }
  async findMany(f: OpportunityFilter) {
    return this.items.filter(
      (o) =>
        (!f.type || o.props.type === f.type) &&
        (!f.sourceUrl || o.props.sourceUrl === f.sourceUrl) &&
        (!f.createdBy || o.props.createdBy === f.createdBy),
    );
  }
  async save(o: Opportunity) {
    this.items.push(o);
  }
  async update() {}
}

describe('Student-suggested competitions', () => {
  const inAMonth = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  let repo: MemoryRepo;
  let useCase: OpportunityUseCase;

  beforeEach(() => {
    repo = new MemoryRepo();
    useCase = new OpportunityUseCase(repo);
  });

  it('goes to the review queue as a PENDING_REVIEW team competition', async () => {
    const res = await useCase.suggestCompetition('stu_1', {
      sourceUrl: 'https://Example.com/hackathon/#rules',
      title: 'Hackathon X',
      registerDeadline: inAMonth,
    });
    expect(res).toMatchObject({ status: 'PENDING_REVIEW', existing: false, sourceUrl: 'https://example.com/hackathon' });
    const saved = repo.items[0].props;
    expect(saved).toMatchObject({ type: 'COMPETITION', competitionMode: 'TEAM', createdBy: 'stu_1' });
    expect(OpportunityUseCase.isStudentSuggestion(repo.items[0])).toBe(true);
    expect(await useCase.mySuggestions('stu_1')).toHaveLength(1);
    expect(await useCase.mySuggestions('stu_2')).toHaveLength(0);
  });

  it('the same link again returns the existing competition instead of a duplicate', async () => {
    const first = await useCase.suggestCompetition('stu_1', {
      sourceUrl: 'https://example.com/hackathon',
      title: 'Hackathon X',
      registerDeadline: inAMonth,
    });
    const again = await useCase.suggestCompetition('stu_2', {
      sourceUrl: 'https://example.com/hackathon/',
      title: 'Hackathon X (bản khác)',
      registerDeadline: inAMonth,
    });
    expect(again).toMatchObject({ id: first.id, existing: true });
    expect(repo.items).toHaveLength(1);
  });

  it(`allows ${OpportunityUseCase.SUGGESTIONS_PER_DAY} suggestions a day per student`, async () => {
    for (let i = 0; i < OpportunityUseCase.SUGGESTIONS_PER_DAY; i++) {
      await useCase.suggestCompetition('stu_1', {
        sourceUrl: `https://example.com/c${i}`,
        title: `Cuộc thi ${i}`,
        registerDeadline: inAMonth,
      });
    }
    await expect(
      useCase.suggestCompetition('stu_1', {
        sourceUrl: 'https://example.com/one-more',
        title: 'Thêm nữa',
        registerDeadline: inAMonth,
      }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
