'use strict';
/* Executes the builder rules in the Firestore emulator.
 * Run: firebase emulators:exec --only firestore --project demo-fynx-builder -- node --test scripts/test-terminal-builder-rules.cjs
 * Do not point this at the production project. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Start the Firestore emulator first. This test must not run against production.');
}

function load(specifier) {
  try { return require(specifier); } catch { return require('/tmp/builder-tools/node_modules/' + specifier); }
}
const { initializeTestEnvironment, assertFails, assertSucceeds } = load('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, deleteDoc } = load('firebase/firestore');

const rules = fs.readFileSync(path.join(__dirname, '../backend/rules/firestore.rules'), 'utf8');
const id = 'p1234abcd5678';
const project = {
  name: 'Global Market Intelligence',
  description: 'A private snapshot of the S&P 500, gold, and the dollar.',
  category: 'macro',
  version: 1,
  visibility: 'private',
  authorUid: 'alice',
  main: 'function render(root, FYNX) {\n  return null;\n}\n',
  updatedAt: 1700000000000,
  versions: []
};

let env;
test.before(async () => {
  env = await initializeTestEnvironment({projectId: 'demo-fynx-builder', firestore: {rules}});
});
test.after(async () => { if (env) await env.cleanup(); });

test('firestore rules keep builder projects private to the owner', async () => {
  const aliceDb = env.authenticatedContext('alice').firestore();
  const projectRef = doc(aliceDb, 'users/alice/builderProjects/' + id);
  await assertSucceeds(setDoc(projectRef, project));
  await assertSucceeds(getDoc(projectRef));
  await assertSucceeds(setDoc(projectRef, {...project, version: 2, versions: [{version: 1, savedAt: 10, main: project.main}]}));

  const bobDb = env.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(bobDb, 'users/alice/builderProjects/' + id)));
  await assertFails(setDoc(doc(bobDb, 'users/alice/builderProjects/' + id), {...project, authorUid: 'bob'}));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/builderProjects/' + id)));

  await assertFails(setDoc(projectRef, {...project, visibility: 'public'}));
  await assertFails(setDoc(projectRef, {...project, authorUid: 'bob'}));
  await assertFails(setDoc(projectRef, {...project, category: 'games'}));
  await assertFails(setDoc(projectRef, {...project, apiKey: 'secret-value'}));
  await assertFails(setDoc(projectRef, {...project, description: 'short'}));
  await assertFails(setDoc(doc(aliceDb, 'users/alice/builderProjects/mkts'), project));
  await assertFails(setDoc(projectRef, {...project, versions: [{version: 1, savedAt: 1, main: project.main, apiKey: 'x'}]}));

  const install = doc(aliceDb, 'users/alice/builderInstalls/current');
  await assertSucceeds(setDoc(install, {widgets: [{slot: 'mine-' + id, projectId: id, name: project.name, version: 1, enabled: true}]}));
  await assertFails(getDoc(doc(bobDb, 'users/alice/builderInstalls/current')));
  await assertFails(setDoc(install, {widgets: [{slot: 'mkts', projectId: id, name: 'Markets', version: 1, enabled: true}]}));
  await assertFails(setDoc(install, {widgets: [{slot: 'mine-' + id, projectId: 'pabcdef123456', name: 'Wrong', version: 1, enabled: true}]}));
  await assertFails(setDoc(doc(aliceDb, 'users/alice/builderInstalls/other'), {widgets: []}));
  await assertFails(deleteDoc(install));
  const tooMany = Array.from({length: 13}, (_, index) => {
    const projectId = 'p' + String(index).padStart(8, '0');
    return {slot: 'mine-' + projectId, projectId, name: 'Tool', version: 1, enabled: true};
  });
  await assertFails(setDoc(install, {widgets: tooMany}));

  const admin = env.authenticatedContext('root', {admin: true}).firestore();
  await assertSucceeds(getDoc(doc(admin, 'users/alice/builderProjects/' + id)));
  await assertSucceeds(getDoc(projectRef));
});
