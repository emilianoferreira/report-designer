import { Module, Injectable, CanActivate, ExecutionContext, Controller, Post, Get, Body, Req, Res, HttpCode, UnauthorizedException, ForbiddenException, HttpException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, pbkdf2, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const derive = promisify(pbkdf2);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const sessionToken = (req: any): string => {
  const value = (req.headers.cookie || '').split(';').map((v: string) => v.trim()).find((v: string) => v.startsWith('rd_session='));
  return value?.slice('rd_session='.length) || '';
};
export function companyId(value: any): string {
  if (typeof value !== 'string') throw new ForbiddenException();
  const compact = value.trim().replace(/[{}-]/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(compact)) throw new ForbiddenException();
  return `${compact.slice(0,8)}-${compact.slice(8,12)}-${compact.slice(12,16)}-${compact.slice(16,20)}-${compact.slice(20)}`;
}

@Injectable()
export class AuthService {
  constructor(private db: DataSource) {}
  async find(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) return null;
    const rows = await this.db.query(`SELECT u.id AS user_id,u.email,s.company_id,m.role,s.csrf_token,s.expires_at
      FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id AND u.active
      JOIN auth_memberships m ON m.user_id=u.id AND m.company_id=s.company_id
      JOIN companies c ON c.id=s.company_id AND c.activo
      WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(token)]);
    return rows[0] || null;
  }
  companies(user: string) {
    return this.db.query(`SELECT c.id,c.nombre AS name,m.role FROM auth_memberships m
      JOIN companies c ON c.id=m.company_id AND c.activo WHERE m.user_id=$1 ORDER BY c.id`, [user]);
  }
  async view(session: any) {
    return { user: { id: session.user_id, email: session.email }, company_id: session.company_id,
      role: session.role, csrf_token: session.csrf_token, expires_at: session.expires_at.toISOString(),
      companies: await this.companies(session.user_id) };
  }
  async allowLogin(email: string, ip: string) {
    let allowed = true;
    for (const [key, limit] of [[`email:${email}`, 10], [`ip:${ip}`, 100]] as const) {
      const [row] = await this.db.query(`INSERT INTO auth_login_limits(key_hash,attempts,window_start) VALUES($1,1,now())
        ON CONFLICT(key_hash) DO UPDATE SET
        attempts=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_login_limits.attempts+1 END,
        window_start=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE auth_login_limits.window_start END
        RETURNING attempts`, [hash(key)]);
      allowed = allowed && row.attempts <= limit;
    }
    return allowed;
  }
  async login(email: string, password: string) {
    const [user] = await this.db.query('SELECT id,password_salt,password_hash FROM auth_users WHERE email=$1 AND active', [email]);
    const salt = user ? Buffer.from(user.password_salt, 'hex') : Buffer.alloc(16);
    const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(32);
    const actual = await derive(password, salt, 600000, 32, 'sha256');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || !user) return null;
    const companies = await this.companies(user.id);
    return companies.length ? this.create(user.id, companies[0].id) : null;
  }
  async create(user: string, company: string) {
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    const rows = await this.db.query(`INSERT INTO auth_sessions(token_hash,user_id,company_id,csrf_token)
      SELECT $1,u.id,m.company_id,$4 FROM auth_users u JOIN auth_memberships m ON m.user_id=u.id
      JOIN companies c ON c.id=m.company_id AND c.activo WHERE u.id=$2 AND u.active AND m.company_id=$3
      RETURNING token_hash`, [hash(token), user, company, csrf]);
    if (!rows.length) throw new ForbiddenException();
    return { token, session: await this.find(token) };
  }
  revoke(token: string) { return this.db.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash(token)]); }
}

@Injectable()
class SessionGuard implements CanActivate {
  constructor(private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    res.setHeader('Cache-Control', 'no-store');
    if (req.path === '/health/live' || req.path === '/health/ready') return true;
    if (req.path === '/api/auth/login' && req.method === 'POST') {
      if (req.headers['x-csrf-token'] !== 'login' || req.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException();
      return true;
    }
    req.auth = await this.auth.find(sessionToken(req));
    if (!req.auth) throw new UnauthorizedException();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['x-csrf-token'] !== req.auth.csrf_token || req.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException();
      if (req.path.startsWith('/api/templates') && req.auth.role !== 'editor') throw new ForbiddenException();
    }
    return true;
  }
}

@Controller('api/auth')
class AuthController {
  constructor(private auth: AuthService) {}
  private cookie(res: any, token: string) {
    res.cookie('rd_session', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 8*60*60*1000,
      secure: process.env.AUTH_SECURE_COOKIE === undefined ? process.env.NODE_ENV === 'production' : process.env.AUTH_SECURE_COOKIE !== 'false' });
  }
  @Post('login') @HttpCode(200)
  async login(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || typeof body?.password !== 'string' || body.password.length > 1024) throw new UnauthorizedException();
    if (!await this.auth.allowLogin(email, req.socket.remoteAddress || 'unknown')) throw new HttpException({statusCode:429,message:'Too many login attempts',error:'Too Many Requests'},429);
    const result = await this.auth.login(email, body.password);
    if (!result) throw new UnauthorizedException();
    if (sessionToken(req)) await this.auth.revoke(sessionToken(req));
    this.cookie(res, result.token);
    return this.auth.view(result.session);
  }
  @Get('session')
  current(@Req() req: any) { return this.auth.view(req.auth); }
  @Post('company') @HttpCode(200)
  async switch(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const company = companyId(body?.company_id);
    if (!(await this.auth.companies(req.auth.user_id)).some((c: any) => c.id === company)) throw new ForbiddenException();
    const result = await this.auth.create(req.auth.user_id, company);
    await this.auth.revoke(sessionToken(req));
    this.cookie(res, result.token);
    return this.auth.view(result.session);
  }
  @Post('logout') @HttpCode(204)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    await this.auth.revoke(sessionToken(req));
    res.clearCookie('rd_session', { httpOnly: true, sameSite: 'strict', path: '/',
      secure: process.env.AUTH_SECURE_COOKIE === undefined ? process.env.NODE_ENV === 'production' : process.env.AUTH_SECURE_COOKIE !== 'false' });
  }
}

@Controller('health')
class HealthController {
  constructor(private db: DataSource) {}
  @Get('live') live() { return { status: 'Healthy' }; }
  @Get('ready') async ready() {
    await this.db.query('SELECT 1 FROM auth_users,auth_memberships,auth_sessions,auth_login_limits LIMIT 0');
    return { status: 'Healthy' };
  }
}

@Module({ controllers: [AuthController, HealthController], providers: [AuthService, { provide: APP_GUARD, useClass: SessionGuard }] })
export class AuthModule {}
