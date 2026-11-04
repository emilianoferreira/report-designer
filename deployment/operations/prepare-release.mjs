import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export function reviewRelease(config) {
  const pending = [];
  const need = (key, value, predicate = v => typeof v === 'string' && !!v.trim() && !/example|REVIEW_REQUIRED|replace-with/i.test(v)) => {
    if (!predicate(value)) pending.push(key);
  };
  for (const key of ['server','publicHost','secretsDirectory','tlsCertificateFile','tlsPrivateKeyFile','maintenanceWindow','currentIngress','writerDrainProcedure','rollbackCriteria','operator','monitoringOwner','rpo','rto']) need(key,config[key]);
  need('applicationCommit',config.applicationCommit,v=>/^[a-f0-9]{40}$/.test(v||''));
  for (const key of ['web','dotnet','nestjs','gateway']) need('images.'+key,config.images?.[key],v=>/^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(v||''));
  need('bindAddress',config.bindAddress,v=>typeof v==='string'&&isIP(v)!==0);
  for (const key of ['host','database','applicationRole','caFile']) need('postgres.'+key,config.postgres?.[key]);
  need('postgres.majorVersion',config.postgres?.majorVersion,v=>Number.isInteger(v)&&v>=14);
  for (const key of ['directory','recipient','passfile','role','offsiteDestination']) need('backup.'+key,config.backup?.[key]);
  need('backup.retentionDays',config.backup?.retentionDays,v=>Number.isInteger(v)&&v>0);
  for (const key of ['host','administrativeRole','caFile','passfile','ageIdentityFile','evidence']) need('restoreValidation.'+key,config.restoreValidation?.[key]);
  for (const section of ['postgres','restoreValidation']) need(section+'.port',config[section]?.port,v=>Number.isInteger(v)&&v>=1&&v<=65535);
  if (config.project!=='report-designer-production') pending.push('project');
  if (config.initialUpstream!=='api-nestjs:3000'||config.targetUpstream!=='api-dotnet:8080'||config.rollbackUpstream!=='api-nestjs:3000') pending.push('upstreams');
  for (const key of ['httpsPort','redirectPort']) if (!Number.isInteger(config[key])||config[key]<1||config[key]>65535) pending.push(key);
  if (config.httpsPort===config.redirectPort) pending.push('distinct ports');
  if (config.status!=='reviewed') pending.push('status: requires final human configuration review');
  return { readyForOperatorReview:pending.length===0,pending,
    automaticActions:[],productionExecuted:false,
    phases:['review immutable images, host, TLS and database','block writes and drain requests','encrypted consistent backup and offsite checksum','restore to a new isolated database and verify contents/schema','apply only approved pending migrations and least-privilege grants','start authenticated NestJS first with HTTPS and smoke checks','explicit web-only switch to ASP.NET Core','observe; web-only return to NestJS if needed'],
    rollback:'Change only API_UPSTREAM and recreate web using the same images/database. Never restore a backup merely to switch backends.' };
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const file=process.argv[2]||fileURLToPath(new URL('../production.review.json',import.meta.url));
  const result=reviewRelease(JSON.parse(await readFile(file,'utf8')));
  console.log(JSON.stringify(result,null,2));
  // This command only reviews public configuration; it cannot deploy or connect to PostgreSQL.
  process.exitCode=result.readyForOperatorReview?0:2;
}
