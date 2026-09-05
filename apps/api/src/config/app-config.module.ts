import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateConfig } from './config.schema.js';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
  ],
})
export class AppConfigModule {}
