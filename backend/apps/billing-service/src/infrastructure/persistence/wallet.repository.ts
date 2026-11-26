import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import * as crypto from 'crypto';
import { DomainException, ErrorCode } from '@shared';
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
    const expectedVersion = wallet.version - 1;
    const res = await this.model
      .updateOne(
        { id: wallet.id, version: expectedVersion },
        {
          $set: {
            balanceVnd: wallet.balanceVnd,
            heldVnd: wallet.heldVnd,
            version: wallet.version,
          },
        },
      )
      .exec();
    if (res.matchedCount === 0) {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Số dư ví vừa được cập nhật đồng thời, vui lòng thử lại',
      );
    }
  }

  async creditAtomically(userId: string, amountVnd: number, session?: unknown): Promise<Wallet> {
    if (amountVnd <= 0) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Số tiền nạp phải lớn hơn 0', 400);
    }
    const opts = {
      upsert: true,
      new: true,
      ...(session ? { session: session as ClientSession } : {}),
    };
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $inc: { balanceVnd: amountVnd, version: 1 },
          $setOnInsert: { id: crypto.randomUUID(), userId, heldVnd: 0 },
        },
        opts,
      )
      .exec();
    return new Wallet(doc.id, {
      userId: doc.userId,
      balanceVnd: doc.balanceVnd,
      heldVnd: doc.heldVnd,
      version: doc.version,
    });
  }

  async holdAndCaptureAtomically(
    userId: string,
    amountVnd: number,
    session?: unknown,
  ): Promise<Wallet> {
    if (amountVnd <= 0) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Số tiền thanh toán phải lớn hơn 0', 400);
    }
    const opts = {
      new: true,
      ...(session ? { session: session as ClientSession } : {}),
    };
    const doc = await this.model
      .findOneAndUpdate(
        {
          userId,
          $expr: { $gte: [{ $subtract: ['$balanceVnd', '$heldVnd'] }, amountVnd] },
        },
        {
          $inc: { balanceVnd: -amountVnd, version: 1 },
        },
        opts,
      )
      .exec();
    if (!doc) {
      throw new DomainException(
        ErrorCode.INSUFFICIENT_FUNDS,
        'Số dư khả dụng không đủ để mua gói này',
        422,
      );
    }
    return new Wallet(doc.id, {
      userId: doc.userId,
      balanceVnd: doc.balanceVnd,
      heldVnd: doc.heldVnd,
      version: doc.version,
    });
  }
}
