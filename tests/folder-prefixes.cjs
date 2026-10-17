const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/';
const context = { TextEncoder };
vm.createContext(context);
vm.runInContext(fs.readFileSync(root + 'scripts/include/folderMembership.js', 'utf8') + '\nglobalThis.api = { folderPrefixValid, folderPrefixFor, folderContainerNames };', context);
const { folderPrefixValid, folderPrefixFor, folderContainerNames } = context.api;
for (const pattern of ['coder*', 'gitea-disposable-*', 'a.b*', 'VM group*']) assert.ok(folderPrefixValid(pattern));
for (const pattern of ['', '*', 'coder', 'co*der*', 'coder**', ' coder*', '<img>*', 'x\n*', 'é'.repeat(128) + '*', 'x'.repeat(256) + '*', null, 1]) assert.ok(!folderPrefixValid(pattern), String(pattern));
const names = ['other', 'coder', 'coder-123', 'xcoder', 'Coder', 'gitea', 'gitea-disposable-1', 'a.b', 'axb'];
const plain = values => Array.from(values);
const folder = { containers: ['other', 'coder*', 'gitea*'], prefixes: ['coder*', 'gitea*'] };
assert.deepEqual(plain(folderContainerNames(folder, names)), ['other', 'coder', 'coder-123', 'gitea', 'gitea-disposable-1']);
assert.deepEqual(plain(folderContainerNames(folder, [...names, 'coder-new'])), ['other', 'coder', 'coder-123', 'coder-new', 'gitea', 'gitea-disposable-1']);
assert.deepEqual(plain(folderContainerNames({ containers: ['a.b*'], prefixes: ['a.b*'] }, names)), ['a.b']);
assert.deepEqual(plain(folderContainerNames({ containers: ['other', 'coder'], prefixes: ['coder*'] }, names)), ['other'], 'Disabled bucket must not retain pinned members');
assert.deepEqual(plain(folderContainerNames({ containers: ['coder*'], prefixes: ['coder*', 'coder-1*'] }, names)), ['coder', 'coder-123']);
assert.deepEqual(plain(folderContainerNames({ containers: ['coder-1*'], prefixes: ['coder*', 'coder-1*'] }, names)), [], 'First added bucket owns overlapping names, even when disabled');
assert.equal(folderPrefixFor('coder', ['coder*']), 'coder*');
assert.equal(folderPrefixFor('Coder', ['coder*']), undefined);
assert.deepEqual(plain(folderContainerNames({ containers: ['other', 'missing'] }, names)), ['other', 'missing'], 'Legacy manual membership unchanged');
assert.deepEqual(plain(folderContainerNames({ containers: ['coder*'], prefixes: ['coder*'] }, [])), [], 'Empty buckets remain safe');
for (const page of ['Folder.page', 'folder.view3.Docker.page', 'folder.view3.VMs.page', 'folder.view3.Dashboard.page']) {
	const source = fs.readFileSync(root + page, 'utf8');
	assert.ok(source.includes('scripts/include/folderMembership.js'), page + ' loads shared membership');
}
for (const script of ['docker.js', 'vm.js', 'dashboard.js']) {
	const source = fs.readFileSync(root + 'scripts/' + script, 'utf8');
	assert.ok(source.includes('folderContainerNames(folder,'), script + ' expands dynamic prefixes');
	assert.ok(source.includes('folderPrefixFor(el, folder.prefixes)'), script + ' does not re-add disabled buckets through regex or labels');
}
// Exercise each real page consumer up to its DOM-rendering boundary.
for (const [file, name, boundary, result] of [
	['docker.js', 'createFolder', '    const colspan =', 'combinedContainers'],
	['vm.js', 'createFolder', '    // the HTML template', 'folder.containers'],
	['dashboard.js', 'createFolderDocker', '    // the HTML template', 'folder.containers'],
	['dashboard.js', 'createFolderVM', '    // the HTML template', 'folder.containers'],
]) {
	const source = fs.readFileSync(root + 'scripts/' + file, 'utf8');
	const start = source.indexOf(`const ${name} =`);
	const end = source.indexOf(boundary, start);
	Object.assign(context, { FOLDER_VIEW_DEBUG_MODE: false, folderEvents: { dispatchEvent() {} }, CustomEvent: function() {}, $: { cookie() {} } });
	vm.runInContext(`globalThis.consumer = ${source.slice(start, end).replace(`const ${name} =`, '')}\nreturn ${result}; };`, context);
	const info = Object.fromEntries(names.map(name => [name, { Labels: { 'folder.view3': 'group' } }]));
	const expected = ['other', 'coder', 'coder-123', 'gitea', 'gitea-disposable-1', 'xcoder'];
	if (file === 'docker.js' || name === 'createFolderDocker') expected.push('Coder', 'a.b', 'axb');
	assert.deepEqual(plain(context.consumer({ ...folder, name: 'group', regex: 'coder' }, 'id', 0, [...names], info, [])), expected, file);
	assert.ok(!context.consumer({ containers: [], prefixes: ['coder*'], name: 'group', regex: 'coder' }, 'id', 0, [...names], info, []).includes('coder'), file + ' disabled prefix overrides regex and labels');
}
// Native Docker rows may use a plain span instead of a managed-container link.
const docker = fs.readFileSync(root + 'scripts/docker.js', 'utf8');
const lookup = docker.slice(docker.indexOf('        let $containerTR ='), docker.indexOf('\n        if ($containerTR.length)', docker.indexOf('        let $containerTR =')));
for (const linked of [false, true]) {
	const row = { name: 'gitea-disposable-1', linked };
	const result = { length: 0, hasClass: () => false };
	const query = selector => {
		if (selector === row) return { find: selector => ({ text: () => selector === 'td.ct-name .appname' || linked ? row.name : '' }) };
		if (selector === '#docker_list > tr.sortable') return { filter: callback => ({ first: () => callback.call(row) ? row : result }) };
		return result;
	};
	const dom = vm.createContext({ $: query, FOLDER_VIEW_DEBUG_MODE: false, container_name_in_folder: row.name });
	vm.runInContext(lookup + '\nglobalThis.found = $containerTR;', dom);
	assert.equal(dom.found, row, 'Match both linked and plain-text container names');
}
// Run editor state changes with only jQuery's rendering boundary doubled.
const editor = fs.readFileSync(root + 'scripts/folder.js', 'utf8');
const page = fs.readFileSync(root + 'Folder.page', 'utf8');
const english = JSON.parse(fs.readFileSync(root + 'langs/en.json', 'utf8'));
assert.ok(english['prefix-help'].includes('gitea*') && english['prefix-help'].length < 100);
assert.ok(page.includes(english['prefix-help']), 'Help has readable HTML fallback');
const languages = fs.readFileSync(root + 'langs/script.php', 'utf8');
for (const locale of ['en', '$loc']) assert.ok(languages.includes(`autov("/plugins/folder.view3/langs/${locale}.json")`) || languages.includes(`autov('/plugins/folder.view3/langs/${locale}.json')`), 'Language URLs bypass stale cache');
assert.ok(editor.includes("$('table.sortable input.container-switch').switchButton({ show_labels: false })"));
const css = fs.readFileSync(root + 'styles/folder.css', 'utf8');
assert.ok(css.includes('.prefix-bucket-controls .switch-button-background.checked { background-color: #ff8c2f; }'));
assert.ok(!css.includes('.prefix-switch::before'), 'Prefix uses native switch shape, not custom imitation');
let rendered = [];
let rows = [];
const regex = { value: '', setCustomValidity() {}, reportValidity() {} };
const input = { value: 'coder*', setCustomValidity(value) { this.error = value; }, reportValidity() {} };
const query = selector => {
	if (typeof selector === 'string' && selector.startsWith('<tr')) {
		const value = selector.match(/value="([^"]+)"/)[1];
		return { html: selector, value, checked: selector.includes('checked'), disabled: selector.includes('disabled'), find() { return this; }, on(event, handler) { this[event] = handler; return this; } };
	}
	if (selector === '.sortable > tbody') return {
		empty() { rendered = []; rows = []; },
		append(row) { rendered.push(row); if (!row.disabled) rows.push(row); },
		prepend(row) { rendered.unshift(row); },
	};
	if (selector === '[name="name"]') return [{ value: 'group' }];
	const chain = { switchButton() { return this; }, parent() { return this; }, find() { return this; }, attr() { return this; }, css() { return this; }, off() { return this; }, end() { return this; }, each() { return this; }, on() { return this; } };
	return chain;
};
query.i18n = key => key;
Object.assign(context, {
	$: query, choose: [{ Name: 'coder', Icon: '/icon' }, { Name: 'coder-123' }, { Name: 'other' }], selected: [], selectedRegex: [], prefixes: [], prefixMembers: [],
	document: { getElementById: () => input, querySelector: () => ({ elements: { regex } }), querySelectorAll: () => rows },
	updateFolderPreview() {}, sortTable() {}, folderHtml: value => String(value),
});
vm.runInContext(editor.slice(editor.indexOf('const updateRegex ='), editor.indexOf('/**\n * Update the setting visibility according to the preview setting')) + '\n' + editor.slice(editor.indexOf('const updateList ='), editor.indexOf('/**\n * i have no idea')) + '\nglobalThis.editor = { addPrefix, removePrefix, updateList };', context);
context.editor.updateList();
context.editor.addPrefix();
assert.deepEqual(plain(context.prefixes), ['coder*']);
assert.deepEqual(plain(context.prefixMembers.map(item => item.Name)), ['coder', 'coder-123']);
assert.deepEqual(plain(context.choose.map(item => item.Name)), ['other']);
assert.deepEqual(plain(context.selected.map(item => item.Name)), ['coder*']);
assert.equal(rendered.length, 4);
assert.ok(rendered[0].html.includes('prefix-delete') && rendered[0].html.indexOf('prefix-delete') < rendered[0].html.indexOf('prefix-switch'));
const members = rendered.slice(1, 3).map(row => ({ checked: row.checked, dataset: { prefixMember: 'coder*' } }));
const queryRows = context.document.querySelectorAll;
context.document.querySelectorAll = () => members;
rendered[0].change.call({ checked: false });
assert.ok(members.every(member => !member.checked), 'Bucket switch disables all preview members');
rendered[0].change.call({ checked: true });
assert.ok(members.every(member => member.checked), 'Bucket switch enables all preview members');
context.document.querySelectorAll = queryRows;
input.value = 'coder*';
context.editor.addPrefix();
assert.equal(input.error, 'prefix-duplicate');
assert.equal(context.prefixes.length, 1);
context.editor.removePrefix('coder*');
assert.equal(context.prefixes.length, 0);
assert.equal(context.prefixMembers.length, 0);
assert.deepEqual(plain(context.choose.map(item => item.Name)), ['other', 'coder', 'coder-123']);
assert.equal(rendered.length, 3);
for (const pattern of ['*', 'co*der*']) {
	input.value = pattern;
	context.editor.addPrefix();
	assert.equal(input.error, 'prefix-invalid');
	assert.equal(context.prefixes.length, 0);
}
// Saving persists bucket rules and their position, not today's concrete matches.
const submitStart = editor.indexOf('const submitForm =');
vm.runInContext(editor.slice(submitStart, editor.indexOf('\n/**', submitStart)) + '\nglobalThis.submitForm = submitForm;', context);
const form = {
	name: { value: 'group' }, icon: { value: '' }, regex,
	preview_text_width: { value: '' }, preview_border_color: { value: '#ffffff' }, preview_vertical_bars_color: { value: '#ffffff' },
};
for (const key of ['preview', 'context', 'context_trigger', 'context_graph', 'context_graph_time']) form[key] = { value: '1' };
for (const key of ['preview_hover', 'preview_update', 'preview_grayscale', 'preview_webui', 'preview_logs', 'preview_console', 'preview_vertical_bars', 'preview_border', 'update_column', 'default_action', 'expand_tab', 'override_default_actions', 'expand_dashboard']) form[key] = { checked: false };
const saveQuery = selector => {
	if (selector === 'input[name*="custom_action"]') return { map: () => ({ get: () => [] }) };
	assert.equal(selector, '.sortable input[name="containers[]"]:checked:not([data-prefix-member])');
	return { map: () => ['other', 'coder*'] };
};
let saved;
saveQuery.post = async (_url, payload) => { saved = JSON.parse(payload.content); };
Object.assign(context, { $: saveQuery, prefixes: ['coder*', 'gitea*'], folderId: 'id', type: 'docker', location: { pathname: '/Docker/Folder' } });
context.submitForm(form).then(() => {
	assert.deepEqual(saved.prefixes, ['coder*', 'gitea*']);
	assert.deepEqual(saved.containers, ['other', 'coder*']);
	assert.deepEqual(plain(folderContainerNames(saved, names)), ['other', 'coder', 'coder-123']);
	console.log('Folder prefix regression checks passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
