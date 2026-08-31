#!/usr/bin/env node

const args = process.argv.slice(2);
const first = args[0];
const skipHeartbeat =
	first === 'eval' ||
	first === 'help' ||
	args.includes('--help') ||
	args.includes('-h') ||
	args.includes('--version') ||
	args.includes('-V');

if (!skipHeartbeat) {
	process.stdout.write('Starting Langflower...\n');
}

await import('../dist/index.js');
