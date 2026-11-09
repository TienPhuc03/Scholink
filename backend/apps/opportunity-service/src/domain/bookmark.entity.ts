export class Bookmark {
  constructor(
    public readonly id: string,
    public userId: string,
    public opportunityId: string,
    public createdAt: Date,
  ) {}
}
