const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(root + 'scripts/include/escapeHtml.js', 'utf8'), context);
const render = icon => vm.runInContext(`folderIconHtml(${JSON.stringify(icon)}, 'folder-img')`, context);
assert.match(render('fa:folder'), /fa-folder/);
assert.match(render('fa:folder'), /aria-hidden="true"/);
assert.match(render('/custom.png'), /<img src="\/custom.png"/);
assert.ok(!render('fa:folder" onclick="bad').includes('<i class='));
assert.ok(!render('/x" onload="bad').includes('src="/x" onload='));
for (const file of ['scripts/include/folderRow.js', 'scripts/dashboard.js', 'scripts/folderview3.js']) {
	assert.ok(fs.readFileSync(root + file, 'utf8').includes('folderIconHtml(folder.icon'), file);
}
const editor = fs.readFileSync(root + 'scripts/folder.js', 'utf8');
assert.ok(editor.includes("button.setAttribute('aria-pressed'"));
assert.ok(editor.includes('custom.hidden = !isCustom'));
const css = fs.readFileSync(root + 'styles/folder.css', 'utf8');
assert.match(css, /aria-pressed="true"[^}]*#ff8c2f/);
const buttons = [];
const picker = { children: buttons, dataset: {}, append: button => buttons.push(button) };
const custom = { hidden: true };
const image = {};
const input = { value: '/existing.png', focus() { this.focused = true; } };
let previews = 0;
Object.assign(context, {
	$: { i18n: key => key },
	updateFolderPreview: () => previews++,
	document: {
		getElementById: id => ({ 'folder-icon-picker': picker, 'folder-custom-icon': custom, 'folder-icon-image': image })[id],
		querySelector: () => ({ elements: { icon: input } }),
		createElement: () => ({ classList: { add() {} }, append() {}, dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(_, callback) { this.click = callback; } }),
	},
});
vm.runInContext(editor.slice(editor.indexOf('const iconPicker'), editor.indexOf("$('div.canvas > form')[0].preview_border_color")) + '\n' + editor.slice(editor.indexOf('const updateIcon ='), editor.indexOf('/**', editor.indexOf('const updateIcon ='))), context);
vm.runInContext('updateIcon(document.querySelector().elements.icon)', context);
assert.equal(custom.hidden, false);
assert.equal(buttons.at(-1).attributes['aria-pressed'], 'true');
buttons[0].click();
assert.equal(input.value, 'fa:folder');
assert.equal(custom.hidden, true);
assert.equal(buttons[0].attributes['aria-pressed'], 'true');
assert.equal(buttons.at(-1).attributes['aria-pressed'], 'false');
buttons.at(-1).click();
assert.equal(input.value, '/existing.png');
assert.equal(input.focused, true);
assert.equal(custom.hidden, false);
assert.equal(previews, 3);
console.log('Preset rendering, escaping, page integration, click selection and custom URL restoration passed');
