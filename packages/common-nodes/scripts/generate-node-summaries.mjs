import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** @type {ReadonlyArray<{ dir: string; type: string; name: string; category: string; summary: string; inputs?: string; outputs?: string; notes?: string }>} */
const nodes = [
	{
		dir: 'ai/dialog',
		type: 'common-dialog',
		name: 'Dialog',
		category: 'AI',
		summary:
			'HITL-нода: принимает вопрос на входе, вызывает `runtime.waitForUserInput`, эмитит ответ пользователя на `reply`. Опционально регистрирует tool через harness.',
		inputs: '`question` (string, required, multiline)',
		outputs: '`reply` (string), `toolRegistration` (tool-registration)',
	},
	{
		dir: 'output/preview',
		type: 'common-preview',
		name: 'Preview',
		category: 'Output',
		summary:
			'Форматирует входное значение в строку (JSON для объектов) и пробрасывает в work log. Терминальная нода для отображения результата.',
		inputs: '`text` (any, required, inline: preview)',
		outputs: '`text` (passthroughFrom: text)',
	},
	{
		dir: 'output/finish',
		type: 'common-finish',
		name: 'Finish',
		category: 'Output',
		summary:
			'Sink-нода с `stopsRun: true` — первое значение на выходе завершает run. Используется как синтетический finish-sink.',
		inputs: '`value` (any, required)',
		outputs: '`value` (passthroughFrom: value)',
		notes: '`stopsRun: true`, `emitOncePerActivation: true`',
	},
	{
		dir: 'primitives/string',
		type: 'common-string',
		name: 'String',
		category: 'Primitives',
		summary:
			'String literal from the inline `value` input port → output `value`.',
		inputs: "`value` (string, inline: text, default '')",
		outputs: '`value` (string)',
	},
	{
		dir: 'primitives/number',
		type: 'common-number',
		name: 'Number',
		category: 'Primitives',
		summary:
			'Number literal from the inline `value` input port → output `value`.',
		inputs: '`value` (number, inline: number, default 0)',
		outputs: '`value` (number)',
	},
	{
		dir: 'primitives/boolean',
		type: 'common-boolean',
		name: 'Boolean',
		category: 'Primitives',
		summary:
			'Boolean literal from the inline `value` input port → output `value`.',
		inputs: '`value` (boolean, inline: boolean, default false)',
		outputs: '`value` (boolean)',
	},
	{
		dir: 'primitives/json-parse',
		type: 'common-json-parse',
		name: 'JSON Parse',
		category: 'Primitives',
		summary: 'Парсит JSON-текст во `value` (object/array/primitive).',
		inputs: '`text` (string, required)',
		outputs: '`value` (any)',
	},
	{
		dir: 'primitives/json-stringify',
		type: 'common-json-stringify',
		name: 'JSON Stringify',
		category: 'Primitives',
		summary: 'Сериализует входное значение в JSON-строку.',
		inputs: '`value` (any, required)',
		outputs: '`text` (string)',
	},
	{
		dir: 'primitives/passthrough',
		type: 'common-passthrough',
		name: 'Passthrough',
		category: 'Primitives',
		summary: 'Пробрасывает входное значение на выход без преобразования.',
		inputs: '`value` (any, required)',
		outputs: '`value` (passthroughFrom: value)',
	},
	{
		dir: 'primitives/set-fields',
		type: 'common-set-fields',
		name: 'Set Fields',
		category: 'Primitives',
		summary:
			'Мержит/перезаписывает поля JSON-объекта из panel `fields` поверх входного `value`.',
		inputs: '`value` (object, required)',
		outputs: '`value` (object)',
	},
	{
		dir: 'logic/compare',
		type: 'common-compare',
		name: 'Compare',
		category: 'Logic',
		summary:
			'Сравнивает `a` и `b` по оператору (eq, ne, gt, contains, …) → boolean `result`.',
		inputs: '`a`, `b` (any)',
		outputs: '`result` (boolean)',
	},
	{
		dir: 'logic/assert',
		type: 'common-assert',
		name: 'Assert',
		category: 'Logic',
		summary:
			'Если `condition` !== true — бросает ошибку с сообщением из panel; иначе passthrough `value`.',
		inputs: '`condition` (boolean), `value` (any)',
		outputs: '`value` (passthroughFrom: value)',
	},
	{
		dir: 'logic/if',
		type: 'common-if',
		name: 'If',
		category: 'Logic',
		summary:
			'Маршрутизирует `value` на выход `true` или `false` в зависимости от `condition`.',
		inputs: '`condition` (boolean), `value` (any)',
		outputs: '`true`, `false`',
	},
	{
		dir: 'logic/gate',
		type: 'common-gate',
		name: 'Gate',
		category: 'Logic',
		summary: 'Пропускает `value` на выход только когда `pass === true`.',
		inputs: '`pass` (boolean), `value` (any)',
		outputs: '`value` (passthroughFrom: value)',
	},
	{
		dir: 'logic/merge',
		type: 'common-merge',
		name: 'Merge',
		category: 'Logic',
		summary: 'Собирает multi-input слоты в JSON-массив на выходе `items`.',
		inputs: '`items` (multi-slot, any)',
		outputs: '`items` (array)',
	},
	{
		dir: 'logic/switch',
		type: 'common-switch',
		name: 'Switch',
		category: 'Logic',
		summary:
			'Маршрутизация по rules: первое совпадение `value` с rule → соответствующий output port; иначе `default`. Per-instance rules из panel params.',
		inputs: '`value` (any, required)',
		outputs: 'Динамические порты по rules + `default`',
		notes: 'Static ports pass/fail/default; panel rules clamp to that set.',
	},
	{
		dir: 'logic/router',
		type: 'common-router',
		name: 'Router',
		category: 'Logic',
		summary:
			'N-канальный router: paired input/output порты по channel names. Per-instance channels из `routerChannels`.',
		inputs: 'По одному input на channel',
		outputs: 'По одному output на channel',
		notes: 'Bypass ports from edges; no separate canvas builder.',
	},
	{
		dir: 'text/join',
		type: 'common-join',
		name: 'Join',
		category: 'Text',
		summary:
			'Склеивает multi-input `lines` с separator из panel params → `text`.',
		inputs: '`lines` (multi-slot, string)',
		outputs: '`text` (string)',
	},
	{
		dir: 'text/split',
		type: 'common-split',
		name: 'Split',
		category: 'Text',
		summary: 'Split текста по delimiter → массив `parts`.',
		inputs: '`text` (string, required)',
		outputs: '`parts` (array)',
	},
	{
		dir: 'text/replace',
		type: 'common-replace',
		name: 'Replace',
		category: 'Text',
		summary: 'Find/replace (literal или regex) в тексте.',
		inputs: '`text` (string, required)',
		outputs: '`text` (string)',
	},
	{
		dir: 'text/regex-extract',
		type: 'common-regex-extract',
		name: 'Regex Extract',
		category: 'Text',
		summary: 'Извлекает regex matches / groups из текста.',
		inputs: '`text` (string, required)',
		outputs: '`matches` (array/string)',
	},
	{
		dir: 'text/template',
		type: 'common-template',
		name: 'Template',
		category: 'Text',
		summary:
			'Mustache-like шаблон с context path для подстановки значений.',
		inputs: '`context` (object, required)',
		outputs: '`text` (string)',
	},
	{
		dir: 'text/trim',
		type: 'common-trim',
		name: 'Trim',
		category: 'Text',
		summary: 'trim start/end/both для строки.',
		inputs: '`text` (string, required)',
		outputs: '`text` (string)',
	},
	{
		dir: 'text/markdown-strip',
		type: 'common-markdown-strip',
		name: 'Markdown Strip',
		category: 'Text',
		summary: 'Убирает markdown-разметку из текста.',
		inputs: '`text` (string, required)',
		outputs: '`text` (string)',
	},
	{
		dir: 'crawl/fetch-url',
		type: 'common-fetch-url',
		name: 'Fetch URL',
		category: 'Crawl',
		summary: 'HTTP fetch URL через server harness + htmlToText для body.',
		inputs: '`url` (string, required)',
		outputs: '`text`, `html`, `status`',
	},
	{
		dir: 'crawl/extract-links',
		type: 'common-extract-links',
		name: 'Extract Links',
		category: 'Crawl',
		summary: 'Извлекает ссылки из HTML с учётом baseUrl.',
		inputs: '`html`, `baseUrl`',
		outputs: '`links` (array)',
	},
	{
		dir: 'crawl/save-page',
		type: 'common-save-page',
		name: 'Save Page',
		category: 'Crawl',
		summary: 'Сохраняет страницу в crawl run через server harness.',
		inputs: '`url`, `html`, `text`',
		outputs: '`saved` (path/metadata)',
	},
	{
		dir: 'crawl/crawl',
		type: 'common-crawl',
		name: 'Crawl',
		category: 'Crawl',
		summary:
			'BFS crawl с лимитами depth/pages/host через server crawl context.',
		inputs: '`startUrl` (string, required)',
		outputs: '`pages` (array)',
	},
	{
		dir: 'test-nodes/constant',
		type: 'common-constant',
		name: 'Constant',
		category: 'Test',
		summary: 'Test fixture: string constant из panel params (как String).',
		inputs: '—',
		outputs: '`value` (string)',
	},
	{
		dir: 'test-nodes/collect',
		type: 'common-collect',
		name: 'Collect',
		category: 'Test',
		summary: 'Test fixture: склеивает 2 slot-input в текст.',
		inputs: '`lines` (2 slots)',
		outputs: '`text` (string)',
	},
	{
		dir: 'test-nodes/concat',
		type: 'common-concat',
		name: 'Concat',
		category: 'Test',
		summary: 'Test fixture: конкатенация двух строк.',
		inputs: '`a`, `b` (string)',
		outputs: '`text` (string)',
	},
	{
		dir: 'test-nodes/delay',
		type: 'common-delay',
		name: 'Delay',
		category: 'Test',
		summary:
			'Test fixture: passthrough после timer delay из panel `delay` ms.',
		inputs: '`value` (any)',
		outputs: '`value` (passthroughFrom: value)',
	},
	{
		dir: 'test-nodes/flaky',
		type: 'common-flaky',
		name: 'Flaky',
		category: 'Test',
		summary:
			'Test fixture: fail N-1 раз (panel `failCount`) для проверки retry.',
		inputs: '`value` (any)',
		outputs: '`value`',
	},
	{
		dir: 'test-nodes/throw',
		type: 'common-throw',
		name: 'Throw',
		category: 'Test',
		summary: 'Test fixture: намеренный throwError на output `done`.',
		inputs: '—',
		outputs: '`done` (string, error-only stream)',
	},
	{
		dir: 'test-nodes/triple',
		type: 'common-triple',
		name: 'Triple',
		category: 'Test',
		summary:
			'Test fixture: эмитит value 3 раза с interval(delay) — reference для reactive bind API.',
		inputs: '`value`, `delay` (inline, default 100)',
		outputs: '`value`',
	},
];

function renderMd(node) {
	const lines = [
		`# ${node.name}`,
		'',
		`| | |`,
		`|---|---|`,
		`| **Type** | \`${node.type}\` |`,
		`| **Category** | ${node.category} |`,
		'',
		'## Summary',
		'',
		node.summary,
		'',
	];

	if (node.inputs !== undefined) {
		lines.push('## Inputs', '', node.inputs, '');
	}

	if (node.outputs !== undefined) {
		lines.push('## Outputs', '', node.outputs, '');
	}

	if (node.notes !== undefined) {
		lines.push('## Notes', '', node.notes, '');
	}

	lines.push(
		'---',
		'',
		'*Implementation removed — re-add via `defineReactiveNode` + `bind()` API.*',
		'',
	);

	return lines.join('\n');
}

for (const node of nodes) {
	const dir = path.join(root, node.dir);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, 'NODE.md'), renderMd(node));
}

console.log(`Wrote ${nodes.length} NODE.md files`);
