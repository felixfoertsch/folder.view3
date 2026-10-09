const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/folderview3.js', 'utf8');
const start = source.indexOf('const downloadFile =');
const end = source.indexOf('\nconst fileManager', start);
let clicked = false, removed = false, revoked = false;
const attributes = {};
const context = {
	Blob,
	URL: { createObjectURL(blob) { assert.equal(blob.type, 'application/json;charset=utf-8'); return 'blob:test'; }, revokeObjectURL(url) { assert.equal(url, 'blob:test'); revoked = true; } },
	document: { createElement: () => ({ style: {}, setAttribute(key, value) { attributes[key] = value; }, click() { clicked = true; }, remove() { removed = true; } }), body: { appendChild() {} } },
	setTimeout(callback) { callback(); },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\ndownloadFile("Docker.json", "{}");', context);
assert.deepEqual(attributes, { href: 'blob:test', download: 'Docker.json' });
assert.ok(clicked && removed && revoked);
console.log('Folder export checks passed');
