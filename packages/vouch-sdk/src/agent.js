const Groq = require('groq-sdk');
const { getM2MToken, isDemoMode, VouchClient } = require('./client');
const { getPolicyDecision, loadPolicy } = require('./policy');

const tools = [
  {
    type: 'function',
    function: {
      name: 'github_createBranch',
      description: 'Create a new branch in the repository through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branchName: { type: 'string' },
          from: { type: 'string', default: 'main' },
        },
        required: ['repo', 'branchName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_readCode',
      description: 'Read source code from a repository file through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['repo', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_listCommits',
      description: 'List recent commits from a repository branch through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string', default: 'main' },
          limit: { type: 'number', default: 10 },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_openPR',
      description: 'Open a pull request through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string', default: 'main' },
        },
        required: ['repo', 'title', 'head'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'linear_createIssue',
      description: 'Create a Linear issue through Vouch',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          teamId: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
];

function extractBranchNameFromTask(task) {
  const normalizedTask = String(task || '').trim();
  const patterns = [
    /branch called ["']?([A-Za-z0-9._/-]+)["']?/i,
    /create (?:a )?branch ["']?([A-Za-z0-9._/-]+)["']?/i,
    /branch ["']?([A-Za-z0-9._/-]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedTask.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return 'feature/test-vouch';
}

function getToolActionName(toolName) {
  const [service, ...actionParts] = String(toolName || '').split('_');
  return `${service}.${actionParts.join('_')}`;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function logLine(message, options = {}) {
  if (!options.quiet) {
    process.stdout.write(`${message}\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDemoToolCalls(task, options = {}) {
  const repo = options.repo || process.env.VOUCH_REPO || 'demo/repo';
  const branchName = extractBranchNameFromTask(task);

  return [
    {
      name: 'github_readCode',
      arguments: { repo, path: 'README.md' },
    },
    {
      name: 'github_listCommits',
      arguments: { repo, branch: 'main', limit: 5 },
    },
    {
      name: 'github_createBranch',
      arguments: { repo, branchName, from: 'main' },
    },
  ];
}

async function executeToolCall(call, options) {
  const {
    policy,
    vouch,
    approval = {},
    quiet = false,
  } = options;
  const toolName = call.name || call.function?.name;
  const params = call.arguments || JSON.parse(call.function?.arguments || '{}');
  const fullAction = getToolActionName(toolName);

  logLine(`[tool] ${toolName} ${safeJson(params)}`, { quiet });

  const decision = getPolicyDecision(policy, fullAction);
  if (!decision.allowed) {
    const blocked = { status: 'blocked', reason: decision.reason };
    logLine(`[result] ${safeJson(blocked)}`, { quiet });
    return blocked;
  }

  let result;
  try {
    result = await vouch.callAction(toolName, params);
  } catch (error) {
    result = {
      status: 'error',
      error: error.message,
    };
  }

  logLine(`[result] ${safeJson(result)}`, { quiet });

  if (result.status === 'pending_approval') {
    logLine(`[approval] Waiting for human approval at ${result.approvalUrl}`, { quiet });
    const approvalResult = await vouch.waitForApproval(result.auditId, {
      intervalMs: 3000,
      timeoutMs: 0,
      ...approval,
    });
    logLine(`[approval] ${safeJson(approvalResult)}`, { quiet });
    return {
      ...result,
      approval: approvalResult,
    };
  }

  return result;
}

async function runDemoAgentLoop(task, options) {
  const demoCalls = buildDemoToolCalls(task, options.demo || {});
  const toolResults = [];

  for (let index = 0; index < demoCalls.length; index += 1) {
    const result = await executeToolCall(demoCalls[index], options);
    toolResults.push({
      tool: demoCalls[index].name,
      result,
    });

    if (index < demoCalls.length - 1) {
      await sleep(1000);
    }
  }

  const summary = {
    mode: 'demo',
    task,
    toolResults,
  };

  logLine(`[done] ${safeJson(summary)}`, options);
  return summary;
}

async function runAgent(task, options = {}) {
  const policy = await loadPolicy(options.cwd || process.cwd());
  const delegationId = process.env.VOUCH_DELEGATION_ID || (isDemoMode() ? 'del_demo' : '');

  if (!delegationId) {
    throw new Error('Missing VOUCH_DELEGATION_ID');
  }

  const accessToken = await getM2MToken({ accessToken: options.accessToken });
  const vouch = new VouchClient(delegationId, {
    baseUrl: options.baseUrl,
    accessToken,
    timeout: options.timeout,
  });

  if (isDemoMode()) {
    return runDemoAgentLoop(task, {
      ...options,
      policy,
      vouch,
    });
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY');
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    {
      role: 'system',
      content: [
        'You are a coding agent operating under a Vouch delegation policy.',
        `Allowed actions: ${policy.allow.join(', ') || 'none'}`,
        `Denied actions: ${policy.deny.join(', ') || 'none'}`,
        `Step-up actions: ${policy.stepUpRequired.join(', ') || 'none'}`,
        'Never attempt denied actions. Always use the provided Vouch tools. Never claim to have completed an action unless the tool result confirms it.',
      ].join('\n'),
    },
    { role: 'user', content: task },
  ];

  while (true) {
    const response = await groq.chat.completions.create({
      model: options.model || 'llama-3.3-70b-versatile',
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      const content = choice.message.content || 'Task complete.';
      if (!options.quiet) {
        process.stdout.write(`${content}\n`);
      }
      return content;
    }

    if (choice.finish_reason !== 'tool_calls') {
      throw new Error(`Unsupported Groq finish reason: ${choice.finish_reason}`);
    }

    for (const call of choice.message.tool_calls || []) {
      const result = await executeToolCall(call, {
        ...options,
        policy,
        vouch,
      });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
}

module.exports = {
  buildDemoToolCalls,
  executeToolCall,
  extractBranchNameFromTask,
  runAgent,
  tools,
};
