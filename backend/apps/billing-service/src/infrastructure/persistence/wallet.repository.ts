import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IWalletRepository } from '../../domain/ports/wallet.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { WalletModel, WalletDocument } from './wallet.schema';

@Injectable()
export class MongooseWalletRepository implements IWalletRepository {
  constructor(
    @InjectModel(WalletModel.name) private readonly model: Model<WalletDocument>,
  ) {}

  async findByUserId(userId: string): Promise<Wallet | null> {
    const doc = await this.model.findOne({ userId }).exec();
    if (!doc) return null;
    return new Wallet(doc.id, {
      userId: doc.userId,
      balanceVnd: doc.balanceVnd,
      heldVnd: doc.heldVnd,
      version: doc.version,
    });
  }

  async save(wallet: Wallet): Promise<void> {
    await this.model.create({
      id: wallet.id,
      userId: wallet.userId,
      balanceVnd: wallet.balanceVnd,
      heldVnd: wallet.heldVnd,
      version: wallet.version,
    });
  }

  async update(wallet: Wallet): Promise<void> {
    await this.model
      .updateOne(
        { id: wallet.id },
        {
          balanceVnd: wallet.balanceVnd,
          heldVnd: wallet.heldVnd,
          version: wallet.version,
        },
      )
      .exec();
  }
}
