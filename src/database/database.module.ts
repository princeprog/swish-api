import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from './db';

export const DATABASE_TOKEN = 'KYSELY_DB';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Kysely<DB>({
          dialect: new PostgresDialect({
            pool: new Pool({
              host: config.getOrThrow('DB_HOST'),
              port: parseInt(config.getOrThrow('DB_PORT'), 10),
              user: config.getOrThrow('DB_USER'),
              password: config.getOrThrow('DB_PASSWORD'),
              database: config.getOrThrow('DB_NAME'),
            }),
          }),
        });
      },
    },
  ],
  exports: [DATABASE_TOKEN],
})
export class DatabaseModule {}
