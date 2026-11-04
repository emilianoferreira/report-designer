import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backupDatabase, connect, fingerprintDatabase, restoreAndVerify } from '../../deployment/operations/postgres-recovery.mjs';
import { reviewRelease } from '../../deployment/operations/prepare-release.mjs';

export async function checkRecovery({root,secrets,resultsDir,source,toolCommand,execute,request,switchBackend,setMaintenance,activateRestore,users}) {
  const review=reviewRelease(JSON.parse(await readFile(path.join(root,'deployment/production.review.json'),'utf8')));
  assert.equal(review.readyForOperatorReview,false);assert.deepEqual(review.automaticActions,[]);
  assert.ok(review.pending.includes('images.web'));
  const identityFile=path.join(secrets,'recovery.agekey');
  await execute('age-test-identity','age-keygen',['-o',identityFile]);
  const recipient=await execute('age-test-recipient','age-keygen',['-y',identityFile],{capture:true});
  const checkpoints=[];
  for(const name of ['report-a4','report-ticket-80','price-label']) {
    const payload=JSON.parse(await readFile(path.join(root,'e2e/stage0/fixtures',name+'.json'),'utf8'));
    payload.nombre+=' backup checkpoint';
    if(name==='price-label')payload.template_json.recoveryPayload='x'.repeat(1024*1024);
    checkpoints.push(await request('POST','/api/templates',payload,201));
  }
  await setMaintenance(true);
  const before=await fingerprintDatabase(source);
  await request('POST','/api/templates',{nombre:'blocked during backup',template_json:{}},503);
  assert.deepEqual(await fingerprintDatabase(source),before,'Maintenance must reject writes before the backend');
  const started=Date.now();
  const backup=await backupDatabase({source,directory:path.join(secrets,'backups'),recipient,toolCommand});
  const backupMs=Date.now()-started;
  assert.ok(backup.manifest.bytes>0);assert.ok(backup.manifest.contents.tables.length>=14);
  await setMaintenance(false);
  // A backend rollback must keep writes that happened after the backup checkpoint.
  const sentinel=await request('POST','/api/templates',{nombre:'post-backup write',template_json:{afterBackup:true,unicode:'ñ 漢字'}},201);
  await switchBackend('api-nestjs:3000');
  assert.deepEqual(await request('GET','/api/templates/'+sentinel.id),sentinel);
  const edited=await request('PUT','/api/templates/'+sentinel.id+'/design',{template_json:{...sentinel.template_json,editedByNest:true}});
  await switchBackend('api-dotnet:8080');
  assert.deepEqual(await request('GET','/api/templates/'+sentinel.id),edited);
  const sourceAfterRollback=await fingerprintDatabase(source);
  const administration={...source,database:'postgres'};
  const targetDatabase='restorecheck_'+randomUUID().replaceAll('-','');
  const corruptFile=path.join(secrets,'corrupt.dump.age');
  const corrupted=await readFile(backup.archive);corrupted[corrupted.length-1]^=1;
  await writeFile(corruptFile,corrupted,{mode:0o600});
  const corruptTarget='restorecheck_'+randomUUID().replaceAll('-','');
  await assert.rejects(restoreAndVerify({archive:corruptFile,manifest:backup.manifest,administration,targetDatabase:corruptTarget,identityFile,toolCommand}),/checksum mismatch/);
  const admin=await connect(administration);
  try {assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[corruptTarget])).rowCount,0);}
  finally {await admin.end();}
  await assert.rejects(restoreAndVerify({archive:backup.archive,manifest:backup.manifest,administration,targetDatabase:source.database,identityFile,toolCommand}));
  const restoreStarted=Date.now();
  const restored=await restoreAndVerify({archive:backup.archive,manifest:backup.manifest,administration,targetDatabase,identityFile,toolCommand});
  const restoreMs=Date.now()-restoreStarted;
  await assert.rejects(restoreAndVerify({archive:backup.archive,manifest:backup.manifest,administration,targetDatabase,identityFile,toolCommand}),error=>error.code==='42P04');
  assert.deepEqual(await fingerprintDatabase(source),sourceAfterRollback,'Restore must never change the source database');
  const target={...source,database:targetDatabase};
  const checked=await connect(target);
  try {
    assert.equal((await checked.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
    assert.equal((await checked.query('SELECT 1 FROM report_templates WHERE id=$1',[sentinel.id])).rowCount,0,'Archive is a checkpoint, not a copy of later writes');
    for(const row of checkpoints)assert.deepEqual((await checked.query('SELECT template_json,version FROM report_templates WHERE id=$1',[row.id])).rows[0],
      {template_json:row.template_json,version:row.version});
  } finally {await checked.end();}
  const psql=toolCommand('psql',['--no-password','--set','ON_ERROR_STOP=1','--set','app_role=stage0_app'],target);
  await execute('restored-application-grants',psql.binary,psql.args,{env:psql.env,input:await readFile(path.join(root,'deployment/operations/application-grants.sql'),'utf8')});
  await activateRestore(targetDatabase,checkpoints);
  const report={passed:true,sourceDatabase:source.database,restoreDatabase:targetDatabase,
    encryption:'age public-recipient stream; no plaintext dump file',encryptedBytes:backup.manifest.bytes,archiveSha256:backup.manifest.sha256,
    backupMs,restoreMs,tableCount:restored.tables,rowCount:restored.rows,schemaSha256:restored.schemaSha256,
    exactTableAndSchemaComparison:true,corruptArchiveRejected:true,existingDatabasePreserved:true,sourceUnchanged:true,
    maintenanceWriteRejection:503,postBackupWritesPreservedOnBackendRollback:true,restoredCheckpointExcludesLaterWrites:true,
    restoredSessionsRevoked:true,leastPrivilegeGrantsApplied:true,automaticProductionPromotion:false,productionReviewReady:false};
  await writeFile(path.join(resultsDir,'recovery.json'),JSON.stringify(report,null,2));
  return report;
}
