console.log(
	JSON.stringify({
		argv: process.argv.slice(2),
		loglevel: process.env.npm_config_loglevel,
		verbose: process.env.npm_config_verbose,
	}),
);
