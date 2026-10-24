import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = NotificationModel & Document;
export type ReminderDocument = ReminderModel & Document;
export type NotificationPreferenceDocument = NotificationPreferenceModel & Document;

/**
 * Mục 20 & 27 SRS: Collection notifications (unique userId/businessKey)
 */
@Schema({ collection: 'notifications', timestamps: true })
export class NotificationModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  businessKey?: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop()
  refUrl?: string;

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop()
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(NotificationModel);
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, businessKey: 1 }, { unique: true, sparse: true });

/**
 * Mục 12D, 20 & 27 SRS: Collection reminders
 * Unique (userId, source, milestoneId, offset, deadlineVersion)
 */
@Schema({ collection: 'reminders', timestamps: true })
export class ReminderModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  milestoneId: string;

  @Prop({ required: true })
  offset: string;

  @Prop({ required: true, default: 1 })
  deadlineVersion: number;

  @Prop({ required: true })
  dueAt: Date;

  @Prop({ required: true, index: true })
  plannedSendAt: Date;

  @Prop({ required: true, enum: ['SCHEDULED', 'SENT', 'SUPPRESSED_QUIET_DEADLINE', 'CANCELLED'], default: 'SCHEDULED' })
  status: string;
}

export const ReminderSchema = SchemaFactory.createForClass(ReminderModel);
ReminderSchema.index(
  { userId: 1, source: 1, milestoneId: 1, offset: 1, deadlineVersion: 1 },
  { unique: true },
);

/**
 * Mục 12D & 27 SRS: Collection preferences (Quiet hours [22:00, 07:00) theo timezone người dùng)
 */
@Schema({ collection: 'preferences', timestamps: true })
export class NotificationPreferenceModel {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ default: '22:00' })
  quietStart: string;

  @Prop({ default: '07:00' })
  quietEnd: string;

  @Prop({ default: true })
  pushEnabled: boolean;

  @Prop({ default: true })
  emailEnabled: boolean;

  @Prop({ default: 1 })
  preferenceVersion: number;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(
  NotificationPreferenceModel,
);
