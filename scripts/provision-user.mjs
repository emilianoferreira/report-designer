import { createRequire } from 'node:module';
import { randomBytes, pbkdf2Sync } from 'node:crypto';

// Administrative, explicit tool: reads private JSON from stdin, never prints passwords.
// AUTH_DATABASE_URL must use a schema-owner/admin credential, not the application role.
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { Client } = require('pg');
export async function provisionUser(db, { email, password, companies }) {
  if (typeof email !== 'string' || !email.trim() || email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 1024)
    throw new Error('Use a valid email and a password of 12–1024 characters.');
  if (!Array.isArray(companies) || companies.length === 0 || companies.some(c => !/^[a-f0-9-]{36}$/i.test(c.id) || !['editor', 'viewer'].includes(c.role)))
    throw new Error('Provide at least one {id, role: editor|viewer} membership.');
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex');
  await db.query('BEGIN');
  try {
    const { rows: [user] } = await db.query(`INSERT INTO auth_users(email,password_salt,password_hash)
      VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password_salt=$2,password_hash=$3,active=true RETURNING id`, [email.trim().toLowerCase(), salt, hash]);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1', [user.id]);
    await db.query('DELETE FROM auth_memberships WHERE user_id=$1', [user.id]);
    for (const company of companies) {
      const result = await db.query(`INSERT INTO auth_memberships(user_id,company_id,role)
        SELECT $1,id,$3 FROM companies WHERE id=$2 AND activo RETURNING company_id`, [user.id, company.id, company.role]);
      if (result.rowCount !== 1) throw new Error('Company does not exist or is inactive.');
    }
    await db.query('COMMIT');
    return user.id;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.AUTH_DATABASE_URL) throw new Error('Set AUTH_DATABASE_URL explicitly. No database is selected by default.');
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 65536) throw new Error('Input too large.'); }
  const db = new Client({ connectionString: process.env.AUTH_DATABASE_URL });
  await db.connect();
  try { console.log('User provisioned:', await provisionUser(db, JSON.parse(input))); }
  finally { await db.end(); }
}
