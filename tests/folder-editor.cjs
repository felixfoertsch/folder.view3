const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/';
const source = fs.readFileSync(root + 'scripts/folder.js', 'utf8');
const start = source.indexOf('const updateRegex =');
const end = source.indexOf('\n/**', start);
let redraws = 0;
let rows = [];
const context = {
	choose: [{ Name: 'label', Label: 'group' }, { Name: 'other' }],
	selected: [{ Name: 'manual' }], selectedRegex: [],
	document: { querySelectorAll: () => rows },
	$: () => [{ value: 'group' }], updateList: () => redraws++,
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nglobalThis.updateRegex = updateRegex;', context);
const input = { value: '[', setCustomValidity(value) { this.error = value; }, reportValidity() {} };
context.updateRegex(input);
assert.equal(redraws, 0);
assert.equal(context.choose.length, 2);
assert.equal(input.error, 'Invalid regular expression');
input.value = '';
context.updateRegex(input);
assert.equal(input.error, '');
assert.deepEqual(Array.from(context.selectedRegex, el => el.Name), ['label']);
assert.deepEqual(Array.from(context.choose, el => el.Name), ['other']);
rows = [{ value: 'other', checked: true }, { value: 'manual', checked: false }];
input.value = 'manual';
context.updateRegex(input);
assert.deepEqual(Array.from(context.selected, el => el.Name), ['other']);
assert.deepEqual(Array.from(context.selectedRegex, el => el.Name).sort(), ['label', 'manual']);
assert.equal(context.choose.length, 0);
assert.ok(source.includes(".off('.folderOrder')"));
const sortStart = source.indexOf('const sortTable =');
const sortEnd = source.indexOf('\n/**', sortStart);
const dragging = {};
let inserted;
const table = {
	querySelector: selector => selector === '.dragging' ? dragging : { insertBefore: (item, near) => { inserted = [item, near]; } },
	querySelectorAll: () => [{ getBoundingClientRect: () => ({ top: 0, height: 10 }) }],
};
vm.runInContext(source.slice(sortStart, sortEnd) + '\nglobalThis.sortTable = sortTable;', context);
context.sortTable({ preventDefault() {}, delegateTarget: table, clientY: 20 });
assert.deepEqual(inserted, [dragging, null]);
console.log('Folder editor regression checks passed');
