const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/';
(async () => {
	for (const [file, name, dashboard] of [['vm.js', 'folderCustomAction', false], ['dashboard.js', 'folderVMCustomAction', true]]) {
		const text = fs.readFileSync(root + file, 'utf8');
		const start = text.indexOf(`const ${name} =`);
		const end = text.indexOf('\n/**', start);
		for (const [action, modes, state, expected] of [[0, 0, 'running', 'domain-stop'], [1, 3, 'paused', 'domain-resume'], [1, 3, 'pmsuspended', 'domain-pmwakeup'], [2, 0, 'running', 'domain-restart']]) {
			const sent = [];
			const folder = { actions: [{ type: 0, action, modes, conatiners: ['guest'] }], containers: { guest: { id: 'uuid', state } } };
			const $ = () => ({ show() {}, hide() {} });
			$.post = (url, payload) => { sent.push(payload.action); return { promise: async () => ({ success: true }) }; };
			const context = { $, globalFolders: dashboard ? { vms: { group: folder } } : { group: folder }, loadlist() {}, swal() {} };
			vm.createContext(context);
			vm.runInContext(text.slice(start, end) + `\nglobalThis.run = ${name};`, context);
			await context.run('group', 0);
			assert.deepEqual(sent, [expected], `${file}: ${action}/${modes}/${state}`);
		}
	}
	const dashboard = fs.readFileSync(root + 'dashboard.js', 'utf8');
	assert.ok(!dashboard.includes('folderCustomAction(id, i)'));
	assert.ok(dashboard.includes('globalFolders.docker?.[id]?.status?.expanded'));
	assert.ok(dashboard.includes('case "restart":\n                pass = true;'));
	const context = {};
	vm.createContext(context);
	vm.runInContext(fs.readFileSync(root + 'include/escapeHtml.js', 'utf8') + '\nglobalThis.escape = folderHtml;', context);
	assert.equal(context.escape('<img src="x" onerror=\'bad\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;');
	console.log('Folder action and HTML escaping checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
