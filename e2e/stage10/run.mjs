import { runIsolated } from '../support/run-isolated.mjs';
import { checkPlan } from './check-plan.mjs';
await checkPlan();
await runIsolated({ withHttps:true, withRecovery:true });
