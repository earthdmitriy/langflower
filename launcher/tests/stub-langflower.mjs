import http from 'node:http';

const args = process.argv.slice(2);
const portFlag = args.indexOf('-p');
const port = portFlag >= 0 ? Number(args[portFlag + 1]) : 0;
const projectDir = args[0] ?? '';

if (!Number.isInteger(port) || port < 1) {
	process.stderr.write('stub-langflower: missing -p port\n');
	process.exit(1);
}

const server = http.createServer((_req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('ok');
});

server.listen(port, '127.0.0.1', () => {
	const url = `http://127.0.0.1:${port}`;
	process.stdout.write(
		`LANGFLOWER_READY ${JSON.stringify({
			url,
			port,
			projectDir,
		})}\n`,
	);
});
