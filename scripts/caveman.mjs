import { spawnSync } from 'node:child_process';

const command = process.argv[2] ?? 'help';

const workflows = {
  setup: ['npm', ['run', 'setup']],
  dev: ['docker', ['compose', 'up', '--build']],
  doctor: ['npm', ['run', 'check']],
  full: ['npm', ['run', 'check:full']],
  db: ['npm', ['run', 'db:validate']],
};

if (command === 'help') {
  console.log('PolyCost caveman workflows:');
  console.log('- npm run caveman:setup   Install dependencies and hooks');
  console.log('- npm run caveman:dev     Start the full Docker Compose dev stack');
  console.log('- npm run caveman:doctor  Run the everyday local confidence check');
  console.log('- npm run caveman:full    Run the full pre-push verification suite');
  console.log('- npm run caveman:db      Validate database migration state');
  process.exit(0);
}

const workflow = workflows[command];
if (!workflow) {
  console.error(`Unknown caveman workflow: ${command}`);
  process.exit(1);
}

const [executable, args] = workflow;
const result = spawnSync(executable, args, {
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Workflow failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
