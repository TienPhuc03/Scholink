import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WalletDocument = WalletModel & Document;

@Schema({ collection: 'wallets', timestamps: true })
export class WalletModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ required: true, default: 0 })
  balanceVnd: number;

  @Prop({ required: true, default: 0 })
  heldVnd: number;

  @Prop({ default: 1 })
  version: number;
}

export const WalletSchema = SchemaFactory.createForClass(WalletModel);
