import { readFile } from 'node:fs/promises';
import { backupDatabase, restoreAndVerify } from './postgres-recovery.mjs';

const [operation,configFile,...flags]=process.argv.slice(2);
if(!['backup','restore-check'].includes(operation)||!configFile||flags.some(flag=>flag!=='--execute'))
  throw new Error('Usage: node deployment/operations/postgres.mjs backup|restore-check <private-config.json> [--execute]');
const config=JSON.parse(await readFile(configFile,'utf8'));
if(!flags.includes('--execute')) {
  console.log(JSON.stringify({operation,productionExecuted:false,mode:'plan-only',
    sourceDatabase:config.source?.database,restoreDatabase:config.restoreDatabase,
    requires:['reviewed configuration','explicit --execute after user approval','TLS and private passfile','age recipient / separate restore identity'],
    warning:'Restore validation creates a new restorecheck_<uuid> database only. It never overwrites the source or changes application traffic.'},null,2));
} else {
  if(config.reviewed!==true)throw new Error('Configuration has not been reviewed; no PostgreSQL operation executed.');
  try {
    if(operation==='backup') {
      const result=await backupDatabase({source:config.source,directory:config.backupDirectory,recipient:config.recipient});
      console.log(JSON.stringify({archive:result.archive,manifestFile:result.manifestFile,sha256:result.manifest.sha256,bytes:result.manifest.bytes},null,2));
    } else {
      const manifest=JSON.parse(await readFile(config.manifestFile,'utf8'));
      console.log(JSON.stringify(await restoreAndVerify({archive:config.archive,manifest,administration:config.restoreAdministration,
        targetDatabase:config.restoreDatabase,identityFile:config.identityFile}),null,2));
    }
  } catch(error) {
    console.error(error.message);
    if(error.createdRestoreDatabase)console.error('Unpromoted isolated database retained for operator inspection:',error.createdRestoreDatabase);
    process.exitCode=1;
  }
}
