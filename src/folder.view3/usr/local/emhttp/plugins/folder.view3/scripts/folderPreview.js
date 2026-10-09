// Read native rows once; never execute their scripts or container/VM actions.
let folderPreviewRows = new Map();
const folderPreviewNames = form => [...form.querySelectorAll('.sortable input[name="containers[]"]')]
	.filter(input => input.checked || input.disabled).map(input => input.value);
const folderPreviewSafeClone = source => {
	const clone = source.cloneNode(true);
	for (const el of [clone, ...clone.querySelectorAll('*')]) {
		for (const attr of [...el.attributes]) {
			if (/^on/i.test(attr.name) || ['id', 'href', 'action', 'formaction', 'name'].includes(attr.name)) el.removeAttribute(attr.name);
		}
		if (el.matches('input,button,select,textarea')) el.disabled = true;
	}
	for (const el of clone.querySelectorAll('script,iframe,object,embed')) el.remove();
	return clone;
};
const updateFolderPreview = () => {
	for (const popup of document.querySelectorAll('.folder-demo-popup')) popup.remove();
	const form = document.querySelector('form.folder-editor');
	const target = document.getElementById('folder-live-preview');
	const type = new URLSearchParams(location.search).get('type');
	const docker = type === 'docker';
	const settings = Object.fromEntries([...form.elements].filter(el => el.name && !el.name.includes('[')).map(el => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
	const mode = Number(settings.preview);
	const names = folderPreviewNames(form);
	const advanced = $.cookie(docker ? 'docker_listview_mode' : 'vm_listview_mode') === 'advanced';
	const folder = { name: settings.name || $.i18n('sample-folder'), icon: settings.icon || '/plugins/dynamix.docker.manager/images/question.png', settings };
	target.innerHTML = `<table class="${docker ? 'docker_containers' : 'vmachines'}"><tbody>${folderRowHtml(type, folder, 'editorpreview', advanced)}</tbody></table>`;
	const nativeRow = target.querySelector('tr');
	const row = folderPreviewSafeClone(nativeRow);
	nativeRow.replaceWith(row);
	row.tabIndex = 0;
	row.classList.remove('sortable');
	const preview = row.querySelector('.folder-preview');
	preview.classList.add(`folder-preview-${mode}`);
	if (settings.preview_border) preview.style.border = `1px solid ${settings.preview_border_color}`;
	let started = 0;
	let upToDate = true;
	const metadata = new Map([...choose, ...selected, ...selectedRegex].map(item => [item.Name, item]));
	for (const name of names) {
		const source = folderPreviewRows.get(name);
		if (!source) continue;
		const stateInfo = metadata.get(name)?.State;
		if (stateInfo?.Updated === false) upToDate = false;
		const native = folderPreviewSafeClone(source);
		if (native.querySelector('.started, .running')) started++;
		if (settings.expand_tab) {
			native.classList.add('folder-element');
			row.parentElement.append(native);
		}
		if (!mode) continue;
		const outer = source.querySelector(`td.${docker ? 'ct-name' : 'vm-name'} > span.outer`);
		if (!outer) continue;
		const identity = mode === 2 ? outer.querySelector('.hand') : mode === 3 ? outer.querySelector('.inner') : outer;
		if (!identity) continue;
		let item = folderPreviewSafeClone(identity);
		if (mode === 4) {
			const group = document.createElement('span');
			group.className = 'outer';
			const inner = document.createElement('span');
			inner.className = 'inner';
			const title = outer.querySelector(docker ? '.appname' : '.inner > a');
			if (title) inner.append(folderPreviewSafeClone(title));
			const last = [...preview.querySelectorAll('.folder-preview-wrapper > span.outer')].at(-1);
			if (last && last.children.length < 2) {
				last.append(inner);
				if (docker) attachFolderPreviewContext(inner, name, metadata.get(name), settings);
				continue;
			}
			group.append(inner);
			item = group;
		}
		if (docker) {
			const state = item.querySelector('.state');
			if (state) state.innerHTML = state.innerHTML.split('<br>')[0];
			if (settings.preview_update && stateInfo?.Updated === false) {
				for (const el of item.querySelectorAll('.appname, a.exec')) el.classList.add('orange-text');
			}
			const title = item.querySelector(':scope > .inner:last-child') || item;
			for (const [setting, icon] of [['preview_webui', 'external-link'], ['preview_console', 'terminal'], ['preview_logs', 'bars']]) {
				if (settings[setting] && (setting !== 'preview_webui' || stateInfo?.WebUi)) {
					const shortcut = document.createElement('span');
					shortcut.className = 'folder-element-custom-btn';
					shortcut.innerHTML = `<a><i class="fa fa-${icon}" aria-hidden="true"></i></a>`;
					title.append(shortcut);
				}
			}
		}
		for (const img of item.querySelectorAll('img')) if (settings.preview_grayscale) img.style.filter = 'grayscale(1)';
		for (const title of item.querySelectorAll(docker ? '.inner > .appname' : '.inner > a')) title.style.width = settings.preview_text_width;
		const wrapper = document.createElement('div');
		wrapper.className = 'folder-preview-wrapper';
		wrapper.append(item);
		preview.append(wrapper);
		if (docker) attachFolderPreviewContext(item, name, metadata.get(name), settings);
		if (settings.preview_vertical_bars) {
			const divider = document.createElement('div');
			divider.className = 'folder-preview-divider';
			divider.style.borderColor = settings.preview_vertical_bars_color || settings.preview_border_color;
			preview.append(divider);
		}
	}
	row.querySelector('.folder-state').textContent = `${started}/${names.length} ${$.i18n('started')}`;
	const status = row.querySelector('.folder-load-status');
	if (started) { status.classList.remove('stopped', 'red-text'); status.classList.add('started', 'green-text'); }
	if (docker && !upToDate) {
		const update = row.querySelector('.folder-update-text');
		update.classList.replace('green-text', 'orange-text');
		update.textContent = $.i18n('update-ready');
	}
	if (docker && settings.update_column) row.querySelector('.updatecolumn').remove();
	if (docker && !advanced) for (const el of row.querySelectorAll('.advanced')) el.style.display = 'none';
	for (const el of target.querySelectorAll('.folder-preview img')) el.addEventListener('error', () => { el.src = '/plugins/dynamix.docker.manager/images/question.png'; }, { once: true });
	const auto = row.querySelector('.autostart');
	$(auto).switchButton({ labels_placement: 'right', off_label: $.i18n('off'), on_label: $.i18n('on'), checked: false });
	$(auto).parent().css('pointer-events', 'none');
};

const loadFolderPreviewRows = async () => {
	const type = new URLSearchParams(location.search).get('type');
	const path = type === 'docker' ? '/plugins/dynamix.docker.manager/include/DockerContainers.php' : '/plugins/dynamix.vm.manager/include/VMMachines.php';
	try {
		const response = await fetch(path);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const html = (await response.text()).split('\0')[0];
		const parsed = new DOMParser().parseFromString(`<table><tbody>${html}</tbody></table>`, 'text/html');
		for (const row of parsed.querySelectorAll('tr')) {
			const name = row.querySelector(type === 'docker' ? '.ct-name .appname' : '.vm-name .inner > a')?.textContent.trim();
			if (name) folderPreviewRows.set(name, row);
		}
		updateFolderPreview();
	} catch (error) {
		document.getElementById('folder-live-preview').textContent = 'Preview could not be loaded. Reload this page to retry.';
	}
};
const previewPanel = document.querySelector('.folder-live-preview');
const previewBanner = document.querySelector('div.title');
const positionFolderPreview = () => {
	const style = getComputedStyle(previewBanner || document.body);
	previewPanel.style.setProperty('--folder-preview-background', style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : style.backgroundColor);
	previewPanel.style.setProperty('--folder-preview-top', `${previewBanner?.offsetHeight || 0}px`);
};
if (previewBanner) new ResizeObserver(positionFolderPreview).observe(previewBanner);
positionFolderPreview();
const previewForm = document.querySelector('form.folder-editor');
previewForm.addEventListener('input', updateFolderPreview);
previewForm.addEventListener('change', updateFolderPreview);
// jQuery switchButton emits synthetic changes, not native DOM events.
$(previewForm).on('change.folderPreview', 'input,select', event => {
	if (!event.target.closest('.folder-live-preview')) updateFolderPreview();
});
loadFolderPreviewRows();
