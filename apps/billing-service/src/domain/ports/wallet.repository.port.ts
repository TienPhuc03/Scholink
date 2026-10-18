import { Wallet } from '../wallet.entity';

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  update(wallet: Wallet): Promise<void>;
}

export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';
