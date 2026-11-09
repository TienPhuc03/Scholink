import { Module, DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({})
export class DatabaseModule {
  static forService(databaseNameEnvVar: string, defaultDbName: string): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MongooseModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const baseUri = config.get<string>('MONGODB_URI', 'mongodb://localhost:27017');
            const dbName = config.get<string>(databaseNameEnvVar, defaultDbName);
            const connectionUri = baseUri.includes('?')
              ? baseUri.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`)
              : `${baseUri.replace(/\/$/, '')}/${dbName}`;

            return {
              uri: connectionUri,
            };
          },
        }),
      ],
      exports: [MongooseModule],
    };
  }
}
