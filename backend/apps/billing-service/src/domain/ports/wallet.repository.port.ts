import { Wallet } from '../wallet.entity';

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  update(wallet: Wallet): Promise<void>;
  creditAtomically?(userId: string, amountVnd: number, session?: unknown): Promise<Wallet>;
  holdAndCaptureAtomically?(userId: string, amountVnd: number, session?: unknown): Promise<Wallet>;
}

export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';
