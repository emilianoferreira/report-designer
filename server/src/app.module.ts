import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Company, Branch, Contact, Currency,
  InvoiceType, Article, Invoice,
  InvoiceLine, InvoiceTax, ReportTemplate,
} from './entities';
import { TemplatesModule } from './modules/templates/templates.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_NAME', 'bd_dis_reportes'),
        entities: [
          Company, Branch, Contact, Currency,
          InvoiceType, Article, Invoice,
          InvoiceLine, InvoiceTax, ReportTemplate,
        ],
        synchronize: false,  // Never auto-sync; we use SQL scripts
        logging: ['error'],
      }),
    }),

    TemplatesModule,
    InvoicesModule,
  ],
})
export class AppModule {}
