const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadPolicy, resolvePolicyPath } = require('../packages/vouch-sdk/src/policy');

test('resolvePolicyPath and loadPolicy walk up parent directories', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-policy-'));
  const nestedDir = path.join(tempRoot, 'packages', 'vouch-sdk');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, '.vouch.yml'),
    [
      'agent: cursor',
      'allow:',
      '  - github.createBranch',
      'deny:',
      '  - github.mergeToMain',
      'step_up_required:',
      '  - github.openPR',
      '',
    ].join('\n'),
  );

  try {
    const resolvedPath = await resolvePolicyPath(nestedDir);
    assert.equal(resolvedPath, path.join(tempRoot, '.vouch.yml'));

    const policy = await loadPolicy(nestedDir);
    assert.deepEqual(policy.allow, ['github.createBranch']);
    assert.deepEqual(policy.deny, ['github.mergeToMain']);
    assert.deepEqual(policy.stepUpRequired, ['github.openPR']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
