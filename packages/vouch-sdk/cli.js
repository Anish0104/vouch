#!/usr/bin/env node

const readline = require('readline');
const { loadSdkEnv } = require('./src/env');
const { runAgent } = require('./src/agent');

loadSdkEnv();

function printUsage() {
  process.stdout.write('Usage: vouch run "your task"\n');
}

async function promptForTask() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const task = await new Promise((resolve) => {
    rl.question('What should the agent do? ', resolve);
  });

  rl.close();
  return task.trim();
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command !== 'run') {
    printUsage();
    process.exit(1);
  }

  const task = rest.join(' ').trim() || await promptForTask();

  if (!task) {
    printUsage();
    process.exit(1);
  }

  await runAgent(task, {
    cwd: process.cwd(),
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Vouch agent failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  main,
  printUsage,
  promptForTask,
};
