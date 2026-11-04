import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from "typeorm";

@Entity("bookmarks")
@Unique(["userId", "opportunityId"])
export class BookmarkSchema {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid" })
  opportunityId: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
