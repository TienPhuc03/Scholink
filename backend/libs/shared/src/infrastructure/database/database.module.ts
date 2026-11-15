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
            const queryIdx = baseUri.indexOf('?');
            const query = queryIdx !== -1 ? baseUri.substring(queryIdx) : '';
            const pathAndHost = queryIdx !== -1 ? baseUri.substring(0, queryIdx) : baseUri;
            const secondSlash = pathAndHost.indexOf('://');
            const lastSlash = pathAndHost.lastIndexOf('/');
            let hostOnly = pathAndHost;
            if (secondSlash !== -1 && lastSlash > secondSlash + 2) {
              hostOnly = pathAndHost.substring(0, lastSlash);
            } else {
              hostOnly = pathAndHost.replace(/\/+$/, '');
            }
            const connectionUri = `${hostOnly}/${dbName}${query}`;

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
