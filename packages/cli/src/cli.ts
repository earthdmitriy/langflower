import { Command } from 'commander';
import { registerStartCommand } from './start-command.js';

const registerEvalCommand = (program: Command): void => {
	program
		.command('eval')
		.description(
			'Run a golden / fixture eval pack and fail closed when score < threshold',
		)
		.argument('<pack-dir>', 'Directory containing pack.json')
		.option(
			'--project <dir>',
			'Project root for harness path fence (default: pack-dir)',
		)
		.option(
			'--replay <file>',
			'JSON map of caseId → agent output (optional offline / CI agent)',
		)
		.action(
			async (
				packDirArg: string,
				opts: {
					readonly project?: string;
					readonly replay?: string;
				},
			) => {
				const { runEvalCommand } = await import('./eval-command.js');
				await runEvalCommand(packDirArg, opts);
			},
		);
};

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
