// Isolated sample row: never dispatch Docker/VM actions.
const updateFolderPreview = () => {
	const form = document.querySelector('form.folder-editor');
	const target = document.getElementById('folder-live-preview');
	const field = name => form.elements.namedItem(name);
	const checked = name => field(name).checked;
	const value = name => field(name).value;
	const mode = Number(value('preview'));
	const docker = new URLSearchParams(location.search).get('type') === 'docker';
	const label = key => folderHtml($.i18n(key));
	const icon = folderHtml(value('icon') || '/plugins/dynamix.docker.manager/images/question.png');
	const name = folderHtml(value('name') || $.i18n('sample-folder'));
	const sampleIcon = '/plugins/dynamix.docker.manager/images/question.png';
	const samples = ['Sample A', 'Sample B', 'Sample C'];
	const items = samples.map(sample => `<span class="sample-item">${mode !== 3 ? `<img src="${sampleIcon}" alt="">` : ''}${mode !== 2 ? `<span class="sample-label">${sample}</span>` : ''}${docker && mode !== 0 ? `<small>${checked('preview_webui') ? '↗ ' : ''}${checked('preview_logs') ? '≡ ' : ''}${checked('preview_console') ? '>_ ' : ''}</small>` : ''}${docker && checked('preview_update') ? '<small>✓</small>' : ''}</span>`).join('');
	target.innerHTML = `<div class="sample-row" tabindex="0"><div class="sample-identity"><img src="${icon}" alt=""><div><strong>${name}</strong><br><span>${label('started')}</span></div><span>${checked('expand_tab') ? '▾' : '▸'}</span></div>${docker && !checked('update_column') ? `<div class="sample-update">✓ ${label('up-to-date')}</div>` : ''}<div class="sample-items" ${mode === 0 ? 'hidden' : ''}>${items}</div><div class="sample-load">2.00%<br>128 MiB / 8 GiB</div></div><div class="sample-context" hidden></div><div class="sample-details" ${checked('expand_tab') ? '' : 'hidden'}>${samples.join(' · ')}</div><p class="sample-note"></p>`;
	const row = target.querySelector('.sample-row');
	const preview = target.querySelector('.sample-items');
	preview.classList.toggle('sample-hover', checked('preview_hover'));
	preview.classList.toggle('sample-list', mode === 4);
	preview.classList.toggle('sample-grayscale', checked('preview_grayscale'));
	preview.classList.toggle('sample-bars', checked('preview_vertical_bars'));
	preview.style.border = checked('preview_border') ? `1px solid ${value('preview_border_color')}` : 'none';
	preview.style.setProperty('--sample-border', value('preview_border_color'));
	const width = value('preview_text_width');
	if (/^[0-9]+(?:\.[0-9]+)?(?:px|em|rem|%|vw)?$/.test(width)) {
		for (const el of preview.querySelectorAll('.sample-label')) el.style.maxWidth = /^\d+(?:\.\d+)?$/.test(width) ? `${width}px` : width;
	}
	for (const img of target.querySelectorAll('img')) img.onerror = () => { img.onerror = null; img.src = sampleIcon; };
	const context = target.querySelector('.sample-context');
	if (docker && mode !== 0 && value('context') !== '0') {
		context.textContent = value('context') === '2' ? `Sample A · CPU 2.00% · 128 MiB · ${field('context_graph').selectedOptions[0].text} · ${value('context_graph_time')} s` : 'Sample A · 2.00% · 128 MiB';
		const show = () => { context.hidden = false; };
		if (value('context_trigger') === '1') row.addEventListener('mouseenter', show);
		else row.addEventListener('click', show);
		row.addEventListener('focus', show);
		row.addEventListener('mouseleave', () => { context.hidden = true; });
		row.addEventListener('blur', () => { context.hidden = true; });
	}
	target.querySelector('.sample-note').textContent = [
		checked('expand_dashboard') ? $.i18n('expand-dashboard') : '',
		checked('override_default_actions') ? $.i18n('override-default-actions') : '',
		checked('default_action') ? $.i18n('default-action') : '',
	].filter(Boolean).join(' · ');
};

document.querySelector('form.folder-editor').addEventListener('input', updateFolderPreview);
document.querySelector('form.folder-editor').addEventListener('change', updateFolderPreview);
updateFolderPreview();
