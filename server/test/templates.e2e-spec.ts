import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('TemplatesController (e2e)', () => {
  let app: INestApplication;
  const COMPANY_ID = 'c1000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/templates ───

  it('GET /api/templates → lists templates for default company', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/templates')
      .query({ companyId: COMPANY_ID })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Seed data should have at least 1 template
    // Each item should have required fields
    if (res.body.length > 0) {
      const t = res.body[0];
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('nombre');
      expect(t).toHaveProperty('company_id');
      expect(t.company_id).toBe(COMPANY_ID);
    }
  });

  // ─── POST → GET → PUT → PUT design → DELETE (full CRUD lifecycle) ───

  let createdId: string;

  it('POST /api/templates → creates a new template', async () => {
    const payload = {
      nombre: 'Test Template E2E',
      company_id: COMPANY_ID,
      descripcion: 'Created by e2e test',
      template_json: {
        documentType: 'A4',
        template: { sections: {}, elements: [] },
      },
    };

    const res = await request(app.getHttpServer())
      .post('/api/templates')
      .send(payload)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.nombre).toBe('Test Template E2E');
    expect(res.body.company_id).toBe(COMPANY_ID);
    expect(res.body.version).toBe(1);
    expect(res.body.template_json).toEqual(payload.template_json);
    createdId = res.body.id;
  });

  it('GET /api/templates/:id → returns the created template', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/templates/${createdId}`)
      .expect(200);

    expect(res.body.id).toBe(createdId);
    expect(res.body.nombre).toBe('Test Template E2E');
    expect(res.body.descripcion).toBe('Created by e2e test');
  });

  it('PUT /api/templates/:id → updates template metadata', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/templates/${createdId}`)
      .send({ nombre: 'Test Template E2E Updated', descripcion: 'Updated desc' })
      .expect(200);

    expect(res.body.nombre).toBe('Test Template E2E Updated');
    expect(res.body.descripcion).toBe('Updated desc');
    expect(res.body.version).toBe(2); // version incremented
  });

  it('PUT /api/templates/:id/design → saves template design JSON', async () => {
    const newDesign = {
      documentType: 'A4',
      template: {
        sections: { header: { height: 40 } },
        elements: [{ id: 'el-1', type: 'text', content: 'Hello' }],
      },
    };

    const res = await request(app.getHttpServer())
      .put(`/api/templates/${createdId}/design`)
      .send({ template_json: newDesign })
      .expect(200);

    expect(res.body.template_json).toEqual(newDesign);
    expect(res.body.version).toBe(3); // version incremented again
  });

  // ─── Duplicate ───

  let duplicatedId: string;

  it('POST /api/templates/:id/duplicate → duplicates template', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/templates/${createdId}/duplicate`)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.id).not.toBe(createdId);
    expect(res.body.nombre).toContain('(copia)');
    expect(res.body.version).toBe(1); // reset
    expect(res.body.company_id).toBe(COMPANY_ID);
    duplicatedId = res.body.id;
  });

  // ─── Cleanup: delete both ───

  it('DELETE /api/templates/:id → removes template', async () => {
    await request(app.getHttpServer())
      .delete(`/api/templates/${createdId}`)
      .expect(200);

    // Verify it's gone
    await request(app.getHttpServer())
      .get(`/api/templates/${createdId}`)
      .expect(404);
  });

  it('DELETE /api/templates/:id → removes duplicated template', async () => {
    await request(app.getHttpServer())
      .delete(`/api/templates/${duplicatedId}`)
      .expect(200);
  });

  // ─── Error cases ───

  it('GET /api/templates/:id → 404 for non-existent', async () => {
    await request(app.getHttpServer())
      .get('/api/templates/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});
