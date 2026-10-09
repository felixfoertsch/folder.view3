const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/docker.js'), 'utf8');
const start = source.indexOf("$.get('/plugins/folder.view3/server/cpu.php')");
const end = source.indexOf('\n/**', start);
assert.ok(start >= 0 && end > start, 'CPU subscription block exists');
const updates = new Map();
let listener;
const $ = selector => ({
	text: value => updates.set(selector, value),
	css: (name, value) => updates.set(`${selector}:${name}`, value),
});
$.get = () => ({ promise: () => ({ then: callback => {
	callback('2');
	return { catch() {} };
} }) });
vm.runInNewContext(source.slice(start, end), {
	$,
	FOLDER_VIEW_DEBUG_MODE: false,
	dockerload: { addEventListener: (event, callback) => {
		assert.equal(event, 'message');
		listener = callback;
	} },
	globalFolders: { folder: { containers: { first: { id: 'abc' }, second: { id: 'def' } } } },
	memToB: value => Number.parseFloat(value),
	bToMem: value => `${value}B`,
});
assert.equal(typeof listener, 'function');
for (const suffix of ['', '\n', '\n\n', '\nmalformed\npartial;10%\n']) {
	updates.clear();
	listener(`abc;20%;2B / 8B\ndef;40%;3B / 8B${suffix}`);
	assert.equal(updates.get('span.cpu-folder-folder'), '30.00%');
	assert.equal(updates.get('span.mem-folder-folder'), '5B / 8B');
}
for (const message of ['', '\n ', undefined, null, { data: 'abc;20%;2B / 8B' }]) {
	updates.clear();
	listener(message);
	assert.equal(updates.size, 0);
}
const pluginDir = path.join(__dirname, '../src/folder.view3/usr/local/emhttp/plugins/folder.view3');
for (const script of ['docker.js', 'dashboard.js']) {
	const text = fs.readFileSync(path.join(pluginDir, 'scripts', script), 'utf8');
	const expression = text.match(/\(containersInfo\[el\]\?\.Labels\?\.\['folder\.view3'\] \?\? containersInfo\[el\]\?\.Labels\?\.\['folder\.view2'\]\) === folder\.name/);
	assert.ok(expression, `${script}: legacy label fallback exists`);
	for (const [labels, expected] of [
		[{ 'folder.view2': 'group' }, true],
		[{ 'folder.view3': 'group' }, true],
		[{ 'folder.view3': 'other', 'folder.view2': 'group' }, false],
		[{}, false],
	]) {
		assert.equal(vm.runInNewContext(expression[0], {
			containersInfo: { container: { Labels: labels } }, el: 'container', folder: { name: 'group' },
		}), expected);
	}
}
console.log('docker-load and migration regression checks passed');
