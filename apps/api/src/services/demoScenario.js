const { delegationStore } = require('./delegationStore');
const { summarizePolicy } = require('./policySummary');

function getDemoScenarioTemplate() {
  const policy = {
    agent: 'cursor',
    allow: [
      'github.createBranch',
      'github.readCode',
      'github.listCommits',
      'github.listBranches',
      'github.createCommit',
      'github.pushCode',
      'github.openPR',
      'linear.listTeams',
      'linear.listIssues',
      'linear.createIssue',
    ],
    deny: [
      'github.mergeToMain',
      'github.deleteBranch',
      'github.modifyWorkflows',
      'github.accessSecrets',
      'github.deleteRepo',
    ],
    stepUpRequired: ['github.openPR', 'github.pushCode', 'linear.createIssue'],
    expiresIn: '48h',
  };

  return {
    name: 'Hackathon Demo Scenario',
    description: 'Seed a safe default delegation for judges: read and branch freely, require human approval for write-risk actions, and hard block destructive operations.',
    suggestedTask: 'create a branch called feature/final-demo',
    policy,
  };
}

function createDemoScenarioDelegation(userId) {
  const template = getDemoScenarioTemplate();
  const delegation = delegationStore.create({
    agentId: template.policy.agent,
    userId,
    policy: template.policy,
  });

  return {
    delegation,
    scenario: {
      name: template.name,
      description: template.description,
      suggestedTask: template.suggestedTask,
      policySummary: summarizePolicy(delegation.policy),
    },
  };
}

module.exports = {
  createDemoScenarioDelegation,
  getDemoScenarioTemplate,
};
