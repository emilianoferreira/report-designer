import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['node_modules/@angular/cli/bin/ng.js','test','--watch=false','--karma-config=e2e/stage8/karma.cjs'],{
  stdio:'inherit',env:{...process.env,CHROME_BIN:chromium.executablePath()},windowsHide:true
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
