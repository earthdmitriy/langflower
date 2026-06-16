import { Command } from 'commander';
import { registerEvalCommand } from './eval-command.js';
import { registerStartCommand } from './start-command.js';

export const runCli = (argv: readonly string[]): void => {
	const program = new Command();

	program
		.name('langflower')
		.description('Visual LLM-chain builder')
		.version('0.1.0');

	registerStartCommand(program);
	registerEvalCommand(program);

	program.parse(argv);
};
