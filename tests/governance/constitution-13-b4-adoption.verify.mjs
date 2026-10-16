import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=p=>JSON.parse(readFileSync(p,"utf8"));
const a=read(".blueprint/constitution-adoption.json"),b=read(".blueprint/dependency-budget.json"),e=read("docs/BLUEPRINT-13-B4-SOURCE-AUDIT.json");
const seven=["structural-capacity","architectural-longevity","product-elegance","premium-usability","long-term-durability","fortress-security-disaster-resilience","operational-sovereignty-dependency-minimization"];
test("B4 keeps ratified constitutional obligations without grant of Production",()=>{
 assert.equal(a.policyVersion,"1.3.0");assert.equal(a.projectId,"project:cad-cam-3d");
 assert.equal(a.blueprintLevel,"B4");assert.deepEqual(a.inheritedPillars,seven);
 assert.deepEqual(a.disabledPillars,[]);assert.deepEqual(a.constitutionalWaivers,[]);
 assert.equal(a.productionAuthority,"separate-explicit-release-gate");
 assert.equal(a.evidenceAuthority,"canonical-quality-gates");
});
test("source budget keeps local core and blocks unsafe third-party authority",()=>{
 assert.equal(b.policyVersion,a.policyVersion);assert.equal(b.projectId,a.projectId);
 assert.equal(b.posture,"LOCAL_PORTABLE_DESIGN_CORE");
 assert.equal(b.complianceState,"MIGRATION_REQUIRED");assert.ok(b.migrationBlockers.length>=3);
 assert.equal(b.dependencies.find(d=>d.id==="local-cad-cam-runtime")?.class,"LOCAL_CORE");
 for(const p of ["cloud-only-canonical-cad-project","ai-owned-canonical-geometry","provider-specific-format-without-portable-export"])assert.ok(b.forbidden.includes(p),p);
 for(const d of b.dependencies)assert.ok(d.offlineBehavior&&d.exitPath,d.id);
});
test("CAD development policy is offline-only even before Production gates",()=>{
 const doc=readFileSync("docs/DEVELOPMENT_RELEASE_POLICY.md","utf8");
 assert.match(doc,/OFFLINE-FIRST \/ LOCAL-ONLY/);
 assert.doesNotMatch(doc,/# Shared Development \/ Release Policy\n\n## Default now: Development Live Mode/);
});
test("source audit only; incomplete B4 runtime and review remain unverified",()=>{
 assert.equal(e.status,"MIGRATION_REQUIRED_SOURCE_CANDIDATE");
 assert.equal(e.projectId,a.projectId);
 assert.equal(e.policy.version,a.policyVersion);
 assert.equal(e.truth.migration,"MIGRATION_REQUIRED");
 assert.equal(e.truth.offlineRuntime,"UNVERIFIED");
 assert.equal(e.truth.productPass,false);
 assert.equal(e.truth.productionAuthorized,false);
 assert.equal(e.truth.newConstitutionRatification,false);
 assert.ok(e.unresolvedRuntimeQA.length>=3);
 for(const f of e.sourceFiles)assert.ok(existsSync(f),"missing source "+f);
});
