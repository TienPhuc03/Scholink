import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = OrganizationModel & Document;
export type OrganizationMembershipDocument = OrganizationMembershipModel & Document;

@Schema({ collection: 'organizations', timestamps: true })
export class OrganizationModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  taxCode?: string;

  @Prop()
  email?: string;

  @Prop()
  website?: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: 'ACTIVE', enum: ['ACTIVE', 'SUSPENDED'] })
  status: string;

  @Prop({ default: 1 })
  version: number;
}

export const OrganizationSchema = SchemaFactory.createForClass(OrganizationModel);

@Schema({ collection: 'organization_memberships', timestamps: true })
export class OrganizationMembershipModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, default: 'ORGANIZER_MEMBER', enum: ['ORGANIZER_ADMIN', 'ORGANIZER_MEMBER'] })
  role: string;

  @Prop({ required: true, default: 'ACTIVE', enum: ['ACTIVE', 'REVOKED'] })
  status: string;

  @Prop({ required: true })
  grantedBy: string;

  @Prop({ default: Date.now })
  grantedAt: Date;
}

export const OrganizationMembershipSchema = SchemaFactory.createForClass(OrganizationMembershipModel);
OrganizationMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
