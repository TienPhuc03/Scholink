import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule, DatabaseModule } from '@shared';
import { WalletModel, WalletSchema } from './infrastructure/persistence/wallet.schema';
import { PaymentOrderModel, PaymentOrderSchema } from './infrastructure/persistence/payment.schema';
import { WALLET_REPOSITORY } from './domain/ports/wallet.repository.port';
import { PAYMENT_REPOSITORY } from './domain/ports/payment.repository.port';
import { MongooseWalletRepository } from './infrastructure/persistence/wallet.repository';
import { MongoosePaymentRepository } from './infrastructure/persistence/payment.repository';
import { WalletUseCase } from './application/use-cases/wallet.use-case';
import { WalletController } from './presentation/wallet.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('BILLING_DB_NAME', 'scholink_billing'),
    SharedModule,
    MongooseModule.forFeature([
      { name: WalletModel.name, schema: WalletSchema },
      { name: PaymentOrderModel.name, schema: PaymentOrderSchema },
    ]),
  ],
  controllers: [WalletController],
  providers: [
    WalletUseCase,
    {
      provide: WALLET_REPOSITORY,
      useClass: MongooseWalletRepository,
    },
    {
      provide: PAYMENT_REPOSITORY,
      useClass: MongoosePaymentRepository,
    },
  ],
  exports: [WalletUseCase, WALLET_REPOSITORY, PAYMENT_REPOSITORY],
})
export class BillingServiceModule {}
