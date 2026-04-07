import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { TemplatesService } from './templates.service';

@Controller('api/templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  /** GET /api/templates?companyId=xxx */
  @Get()
  findAll(@Query('companyId') companyId: string = 'c1000000-0000-0000-0000-000000000001') {
    return this.service.findAll(companyId);
  }

  /** GET /api/templates/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /** POST /api/templates */
  @Post()
  create(@Body() body: {
    nombre: string;
    company_id?: string;
    descripcion?: string;
    template_json: Record<string, any>;
  }) {
    return this.service.create({
      company_id: body.company_id || 'c1000000-0000-0000-0000-000000000001',
      nombre: body.nombre,
      descripcion: body.descripcion || '',
      template_json: body.template_json,
    });
  }

  /** PUT /api/templates/:id */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<{
    nombre: string;
    descripcion: string;
    estado: string;
    template_json: Record<string, any>;
  }>) {
    return this.service.update(id, body);
  }

  /** PUT /api/templates/:id/design */
  @Put(':id/design')
  saveDesign(@Param('id') id: string, @Body() body: { template_json: Record<string, any> }) {
    return this.service.saveDesign(id, body.template_json);
  }

  /** POST /api/templates/:id/duplicate */
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }

  /** DELETE /api/templates/:id */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
