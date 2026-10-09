const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/';
const source = fs.readFileSync(root + 'scripts/folderPreview.js', 'utf8');
const start = source.indexOf('const folderPreviewNames =');
const end = source.indexOf('const folderPreviewSafeClone', start);
const context = { $: { i18n: key => key } };
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nglobalThis.names = folderPreviewNames;', context);
const rows = [
	{ value: 'conformarr', checked: true },
	{ value: 'Advanced-Parental-Controls', checked: true },
	{ value: 'Guildhouse', checked: true },
	{ value: 'regex-or-label-match', checked: false, disabled: true },
	{ value: 'not-selected', checked: false },
];
assert.deepEqual(Array.from(context.names({ querySelectorAll: () => rows })), rows.slice(0, 4).map(row => row.value));
rows.reverse();
assert.equal(context.names({ querySelectorAll: () => rows })[0], 'regex-or-label-match');
vm.runInContext(fs.readFileSync(root + 'scripts/include/escapeHtml.js', 'utf8') + '\n' + fs.readFileSync(root + 'scripts/include/folderRow.js', 'utf8') + '\nglobalThis.row = folderRowHtml;', context);
for (const type of ['docker', 'vm']) {
	const html = context.row(type, { name: '<unsafe>', icon: '"bad', settings: { preview_hover: true } }, 'preview');
	assert.ok(html.includes('&lt;unsafe&gt;'));
	assert.ok(html.includes('&quot;bad'));
	assert.ok(html.includes('folder-preview'));
	assert.ok(fs.readFileSync(root + `scripts/${type}.js`, 'utf8').includes(`folderRowHtml('${type}', folder, id`));
	assert.ok(fs.readFileSync(root + `folder.view3.${type === 'docker' ? 'Docker' : 'VMs'}.page`, 'utf8').includes('include/folderRow.js'));
}
assert.ok(!source.includes('Sample A'));
assert.ok(source.includes("event.target.closest('.folder-live-preview')"));
assert.ok(source.includes("split('\\0')[0]"));
assert.ok(!source.includes('eval('));
const page = fs.readFileSync(root + 'Folder.page', 'utf8');
assert.equal((page.match(/<fieldset/g) || []).length, 3);
assert.ok(page.includes('<legend data-i18n="order-drag-drop">Order (Drag and Drop)</legend>'));
assert.ok(page.includes('class="folder-color-controls"'));
assert.ok(page.includes('>Reset to default</button>'));
const borders = page.slice(page.indexOf('class="folder-borders"'), page.indexOf('class="folder-assignment"'));
for (const name of ['preview_border', 'preview_vertical_bars', 'preview_border_color']) assert.ok(borders.includes(`name="${name}"`));
assert.ok(page.includes('include/folderRow.js'));
const shortcuts = page.slice(page.indexOf('class="folder-shortcuts"'), page.indexOf('name="preview_vertical_bars"'));
for (const name of ['preview_webui', 'preview_logs', 'preview_console']) assert.ok(shortcuts.includes(`name="${name}"`));
assert.ok(page.includes('Popup Configuration:'));
assert.ok(page.indexOf('class="folder-popup-settings"') > page.indexOf('name="preview_border_color"'));
for (const text of ['Add WebUI icon:', 'Add Logs icon:', 'Add Console icon:']) assert.ok(page.includes(text));
const css = fs.readFileSync(root + 'styles/folder.css', 'utf8');
assert.ok(css.includes('flex-direction: row; align-items: center; flex-wrap: nowrap'));
assert.ok(!css.includes('border-block: 1px') && !css.includes('border-top: 1px'));
assert.equal(JSON.parse(fs.readFileSync(root + 'langs/en.json', 'utf8')).context, 'Popup Configuration:');
assert.ok(fs.readFileSync(root + 'styles/folder.css', 'utf8').includes('position: sticky'));
vm.runInContext(fs.readFileSync(root + 'scripts/include/previewContext.js', 'utf8') + '\nglobalThis.popup = folderPreviewContextHtml;', context);
for (const mode of [1, 2]) {
	const html = context.popup('<unsafe>', { State: { Running: true, WebUi: 'https://example.test' } }, { context: mode, context_graph: 2, context_graph_time: 60 });
	assert.ok(html.includes('disabled'));
	assert.ok(!html.includes('onclick') && !html.includes('href='));
	if (mode === 2) {
		assert.ok(html.includes('&lt;unsafe&gt;'));
		assert.ok(html.includes('CPU') && html.includes('Memory'));
		assert.ok(html.includes('not live measurements'));
	}
}
console.log('Assignment order, shared markup, escaping, read-only popup checks passed');
