import {writeFile,access} from 'node:fs/promises';
import {businessSql} from '@steward/business-kit';
import {missionAccessSql} from '@steward/mission-kit';
import {financeSql,financeManifest} from '@steward/economy-kit/module';
import {missionBudget,moduleId,budgetCapability} from './dist/definition.js';
const manifest=financeManifest(moduleId,'Mission Budget & Funding',missionBudget({}),{provides:[budgetCapability],queries:[{operationId:'budgetOverview',method:'GET',path:'/budget-overview',permission:moduleId+'.read'}]});
manifest.ui.unshift({workspace:'business',screenId:'budget-overview',title:'Mission Budget Overview',navigationLabel:'Budget overview',listOperation:'budgetOverview',fields:['name','currency','status','budgetVersion','approvedBudgetCents','committedCents','receivedCents','encumberedCents','spentCents','spendableCents','fundingGapCents','budgetVarianceCents','conditionalFundedUnits'].map(name=>({name,label:name.replace(/([a-z])([A-Z])/g,'$1 $2'),type:name.endsWith('Cents')||['budgetVersion','conditionalFundedUnits'].includes(name)?'number':'string',required:false,readOnly:true})),columns:['name','currency','approvedBudgetCents','committedCents','receivedCents','spentCents','spendableCents','fundingGapCents']});
await writeFile(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
if(process.argv.includes('--initial-migration')){try{await access(new URL('./migrations/001-foundation.sql',import.meta.url));throw Error('Existing migrations are immutable; append a new migration');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(new URL('./migrations/001-foundation.sql',import.meta.url),businessSql+'\n'+missionAccessSql+'\n'+financeSql+`
CREATE TABLE budget_commitments(commitment_id uuid PRIMARY KEY,program_id uuid NOT NULL,funding_request_id uuid NOT NULL,series_id uuid NOT NULL,category text NOT NULL,currency text NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),source_entity_id uuid NOT NULL,terms_digest text NOT NULL);
CREATE TRIGGER budget_commitments_immutable BEFORE UPDATE OR DELETE ON budget_commitments FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE TABLE budget_receipts(commitment_id uuid PRIMARY KEY REFERENCES budget_commitments(commitment_id),settlement_id uuid NOT NULL UNIQUE,program_id uuid NOT NULL,series_id uuid NOT NULL,category text NOT NULL,currency text NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),terms_digest text NOT NULL,received_at timestamptz NOT NULL);
CREATE TRIGGER budget_receipts_immutable BEFORE UPDATE OR DELETE ON budget_receipts FOR EACH ROW EXECUTE FUNCTION economic_immutable();
`);}
