import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { readFileSync } from 'fs';

export async function authenticatedAgent(app: INestApplication, name = 'alice'): Promise<any> {
  if (!process.env.STAGE8_TEST_USERS || !process.env.STAGE0_RUN_ID || !/^stage0_[a-f0-9]{32}$/.test(process.env.DB_NAME || ''))
    throw new Error('Run npm run test:security; authenticated backend tests require its isolated database and ephemeral users.');
  const users = JSON.parse(readFileSync(process.env.STAGE8_TEST_USERS, 'utf8'));
  const agent = request.agent(app.getHttpServer());
  const response = await agent.post('/api/auth/login').set('X-CSRF-Token', 'login').send(users[name]).expect(200);
  agent.set('X-CSRF-Token', response.body.csrf_token);
  return agent;
}
