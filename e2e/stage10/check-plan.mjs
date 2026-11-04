import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { reviewRelease } from '../../deployment/operations/prepare-release.mjs';

export async function checkPlan() {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const pending=JSON.parse(await readFile(new URL('../../deployment/production.review.json',import.meta.url),'utf8'));
  assert.equal(reviewRelease(pending).readyForOperatorReview,false);
  const complete={...pending,status:'reviewed',server:'reviewed-host',publicHost:'reports.internal',bindAddress:'127.0.0.1',
    secretsDirectory:'/private/secrets',tlsCertificateFile:'/private/tls.pem',tlsPrivateKeyFile:'/private/tls.key',
    maintenanceWindow:'operator window',currentIngress:'operator gateway',writerDrainProcedure:'operator procedure',
    rollbackCriteria:'operator criteria',operator:'operator',monitoringOwner:'operator',rpo:'approved RPO',rto:'approved RTO',
    images:Object.fromEntries(['web','dotnet','nestjs','gateway'].map(name=>[name,`registry.internal/${name}@sha256:${'a'.repeat(64)}`])),
    postgres:{host:'source.internal',port:5432,database:'reports',majorVersion:16,applicationRole:'app',caFile:'/private/pg-ca.pem'},
    backup:{directory:'/private/backups',recipient:'public recipient',passfile:'/private/pgpass',role:'backup',offsiteDestination:'private offsite',retentionDays:30},
    restoreValidation:{host:'restore.internal',port:5432,administrativeRole:'restore',caFile:'/private/pg-ca.pem',passfile:'/private/pgpass',ageIdentityFile:'/private/identity',evidence:'operator evidence'}};
  const ready=reviewRelease(complete);
  assert.deepEqual(ready.pending,[]);assert.deepEqual(ready.automaticActions,[]);assert.equal(ready.productionExecuted,false);
  for(const image of ['web','dotnet','nestjs','gateway']) {
    const invalid=structuredClone(complete);invalid.images[image]='registry.internal/'+image+':latest';
    assert.ok(reviewRelease(invalid).pending.includes('images.'+image));
  }
  for(const section of ['postgres','restoreValidation']) {
    const invalid=structuredClone(complete);invalid[section].port=70000;
    assert.ok(reviewRelease(invalid).pending.includes(section+'.port'));
  }
  assert.ok(reviewRelease({...complete,status:'pending-review'}).pending.some(key=>key.startsWith('status:')));
  const invoke=(...args)=>spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true});
  const review=invoke('deployment/operations/prepare-release.mjs');
  assert.equal(review.status,2);assert.equal(JSON.parse(review.stdout).productionExecuted,false);
  for(const operation of ['backup','restore-check']) {
    const args=['deployment/operations/postgres.mjs',operation,'deployment/operations/operations.example.json'];
    const plan=invoke(...args);
    assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).mode,'plan-only');
    const blocked=invoke(...args,'--execute');
    assert.equal(blocked.status,1);assert.match(blocked.stderr,/Configuration has not been reviewed/);
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await checkPlan();console.log('Offline configuration and plan-only operation guards passed.');
}
