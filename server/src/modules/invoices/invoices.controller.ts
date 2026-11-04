import { Controller, Get, Param, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

@Controller('api/invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  /** GET /api/invoices?companyId=xxx - List invoices */
  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.service.findAll(companyId ?? this.service.company);
  }

  /** GET /api/invoices/:id/data - Get InvoiceData JSON for preview */
  @Get(':id/data')
  getInvoiceData(@Param('id') id: string) {
    return this.service.getInvoiceData(id);
  }
}
