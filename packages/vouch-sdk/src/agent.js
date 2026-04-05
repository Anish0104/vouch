const { execFileSync } = require('child_process');
const Groq = require('groq-sdk');
const { getM2MToken, isDemoMode, VouchClient } = require('./client');
const { getPolicyDecision, loadPolicy } = require('./policy');

const PLACEHOLDER_GITHUB_REPOS = new Set([
  'user/repository',
  'owner/repository',
  'your-org/your-repo',
  'your/repo',
]);

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
      name: 'github_getFileContents',
      description: 'Fetch a file from a GitHub repository through Vouch',
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
      name: 'github_listBranches',
      description: 'List branches in a GitHub repository through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_listPRs',
      description: 'List pull requests in a GitHub repository through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', default: 'open' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_createCommit',
      description: 'Create a commit on a branch through Vouch with one or more file changes',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string' },
          message: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['repo', 'branch', 'message', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_pushCode',
      description: 'Push a prepared commit SHA to a branch ref through Vouch',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string' },
          commitSha: { type: 'string' },
          force: { type: 'boolean', default: false },
        },
        required: ['repo', 'branch', 'commitSha'],
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
      name: 'linear_listTeams',
      description: 'List available Linear teams through Vouch before creating issues',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'linear_listIssues',
      description: 'List issues from Linear through Vouch',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'linear_createIssue',
      description: 'Create a Linear issue through Vouch. If teamId is not known, call linear_listTeams first or pass teamKey/teamName.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          teamId: { type: 'string' },
          teamKey: { type: 'string' },
          teamName: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'linear_updateIssue',
      description: 'Update an existing Linear issue through Vouch',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id'],
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

function parseGitHubRepoFromRemoteUrl(remoteUrl) {
  const normalized = String(remoteUrl || '').trim();
  if (!normalized) {
    return '';
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  const httpsMatch = normalized.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  return '';
}

function detectGitHubRepoFromGit(cwd) {
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return parseGitHubRepoFromRemoteUrl(remoteUrl);
  } catch {
    return '';
  }
}

function resolveDefaultGitHubRepo(options = {}) {
  const explicitRepo = String(options.repo || '').trim();
  if (explicitRepo) {
    return explicitRepo;
  }

  const envRepo = String(process.env.VOUCH_REPO || '').trim();
  if (envRepo) {
    return envRepo;
  }

  return detectGitHubRepoFromGit(options.cwd || process.cwd());
}

function isPlaceholderGitHubRepo(repo) {
  return PLACEHOLDER_GITHUB_REPOS.has(String(repo || '').trim().toLowerCase());
}

function normalizeToolArguments(toolName, params, options = {}) {
  const nextParams = { ...(params || {}) };
  const defaultRepo = String(options.defaultRepo || '').trim();

  if (!String(toolName || '').startsWith('github_')) {
    return nextParams;
  }

  if ((!String(nextParams.repo || '').trim() || isPlaceholderGitHubRepo(nextParams.repo)) && defaultRepo) {
    nextParams.repo = defaultRepo;
  }

  return nextParams;
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

function isGroqRateLimitError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.error?.code || error?.response?.data?.error?.code || '');
  const message = String(error?.message || error?.response?.data?.error?.message || error || '');

  return status === 429
    || code === 'rate_limit_exceeded'
    || message.toLowerCase().includes('rate limit');
}

function summarizeToolResults(task, toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) {
    return `Task finished with no tool calls: ${task}`;
  }

  const lines = toolResults.map(({ tool, result }) => {
    if (result?.status === 'success' && result?.result?.html_url) {
      return `- ${tool}: success (${result.result.html_url})`;
    }

    if (result?.status === 'success' && result?.result?.ref) {
      return `- ${tool}: success (${result.result.ref})`;
    }

    if (result?.status === 'pending_approval' && result?.approval?.status === 'approved' && result?.approval?.event?.result) {
      return `- ${tool}: approved and executed`;
    }

    if (result?.status === 'pending_approval' && result?.approval?.status) {
      return `- ${tool}: ${result.approval.status}`;
    }

    if (result?.status === 'error') {
      return `- ${tool}: error (${result.error || 'unknown error'})`;
    }

    return `- ${tool}: ${result?.status || 'completed'}`;
  });

  return [
    `Task completed through Vouch: ${task}`,
    ...lines,
  ].join('\n');
}

function buildDemoToolCalls(task, options = {}) {
  const repo = resolveDefaultGitHubRepo(options) || 'demo/repo';
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
    defaultRepo = '',
    quiet = false,
  } = options;
  const toolName = call.name || call.function?.name;
  const params = normalizeToolArguments(
    toolName,
    call.arguments || JSON.parse(call.function?.arguments || '{}'),
    { defaultRepo },
  );
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
  const defaultRepo = resolveDefaultGitHubRepo(options);

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
      defaultRepo,
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
        `Default GitHub repository: ${defaultRepo || 'none detected'}`,
        'If the user asks for a GitHub action without naming a repo, use the default GitHub repository.',
        'Never attempt denied actions. Always use the provided Vouch tools. Never claim to have completed an action unless the tool result confirms it.',
      ].join('\n'),
    },
    { role: 'user', content: task },
  ];
  const toolResults = [];

  while (true) {
    let response;
    try {
      response = await groq.chat.completions.create({
        model: options.model || 'llama-3.3-70b-versatile',
        messages,
        tools,
        tool_choice: 'auto',
      });
    } catch (error) {
      if (toolResults.length > 0 && isGroqRateLimitError(error)) {
        const summary = summarizeToolResults(task, toolResults);
        if (!options.quiet) {
          process.stdout.write(`${summary}\n`);
        }
        return summary;
      }
      throw error;
    }

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
        defaultRepo,
        policy,
        vouch,
      });
      toolResults.push({
        tool: call.function?.name || call.name || 'unknown_tool',
        result,
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
  normalizeToolArguments,
  parseGitHubRepoFromRemoteUrl,
  resolveDefaultGitHubRepo,
  runAgent,
  tools,
};
