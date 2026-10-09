// Preview menus contain no operation handlers or executable URLs.
const folderPreviewActions = state => [
	...(state.Running && !state.Paused ? [state.WebUi ? 'webui' : null, 'console', 'stop', 'pause', 'restart'] : [state.Paused ? 'resume' : 'start']),
	'logs', 'edit', 'remove',
].filter(Boolean);
const folderPreviewContextHtml = (name, item, settings) => {
	const state = item?.State || {};
	const ct = item?.Info || {};
	const actions = folderPreviewActions(state).map(key => `<li><button type="button" disabled>${folderHtml($.i18n(key))}</button></li>`).join('');
	if (Number(settings.context) === 1) return `<ul class="folder-demo-menu">${actions}</ul>`;
	const mappings = (rows, format) => rows?.map(format).map(folderHtml).join('<br>') || '—';
	const graph = Number(settings.context_graph);
	const charts = graph === 0 ? '' : `<div class="folder-demo-graphs">${(graph === 2 ? ['CPU', 'Memory'] : [graph === 3 ? 'CPU' : graph === 4 ? 'Memory' : 'CPU / Memory']).map(title => `<figure><figcaption>${title} · ${folderHtml(settings.context_graph_time)} s</figcaption><svg viewBox="0 0 400 100" role="img" aria-label="Illustrative graph, not live measurements"><path d="M0 25H400M0 50H400M0 75H400" fill="none" stroke="currentColor" opacity=".15"/><polyline points="0,80 50,70 100,75 150,40 200,60 250,45 300,55 350,30 400,50" fill="none" stroke="#2b8da3"/>${graph === 1 ? '<polyline points="0,60 50,60 100,58 150,58 200,55 250,55 300,52 350,52 400,50" fill="none" stroke="#5d6db6"/>' : ''}</svg></figure>`).join('')}</div>`;
	return `<div class="preview-outbox"><div class="first-row"><div class="preview-name"><img class="folder-img" src="${folderHtml(item?.Icon || '/plugins/dynamix.docker.manager/images/question.png')}" alt=""><strong>${folderHtml(name)}</strong></div><span>${folderHtml(state.Paused ? $.i18n('paused') : state.Running ? $.i18n('started') : $.i18n('stopped'))}</span></div><p class="folder-demo-warning">Preview only — actions disabled; graphs illustrative, not live measurements.</p><div class="second-row"><div class="action-info"><ul class="folder-demo-menu">${actions}</ul></div><div class="info-section">${charts}<details><summary>${folderHtml($.i18n('port-mappings'))}</summary>${mappings(ct.info?.Ports, p => `${p.PrivatePort}/${p.Type} ↔ ${p.PublicIP || ''}:${p.PublicPort || ''}`)}</details><details><summary>${folderHtml($.i18n('volume-mappings'))}</summary>${mappings(ct.Mounts, m => `${m.Destination} ↔ ${m.Source}`)}</details></div></div></div>`;
};
const attachFolderPreviewContext = (element, name, item, settings) => {
	if (Number(settings.context) === 0) return;
	const popup = document.createElement('div');
	popup.className = 'folder-demo-popup';
	popup.setAttribute('popover', 'auto');
	popup.innerHTML = `<button type="button" class="folder-demo-close" aria-label="Close preview">×</button>${folderPreviewContextHtml(name, item, settings)}`;
	document.body.append(popup);
	popup.querySelector('.folder-demo-close').addEventListener('click', () => popup.hidePopover());
	const trigger = element.querySelector('.hand, a.exec') || element;
	trigger.tabIndex = 0;
	trigger.setAttribute('role', 'button');
	trigger.setAttribute('aria-label', `${name}: preview context`);
	const show = () => {
		popup.showPopover();
		const bounds = trigger.getBoundingClientRect();
		popup.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - popup.offsetWidth - 8))}px`;
		popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - popup.offsetHeight - 8))}px`;
	};
	trigger.addEventListener('click', show);
	trigger.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
	});
	if (Number(settings.context) === 2 && Number(settings.context_trigger) === 1) {
		let close;
		const cancel = () => clearTimeout(close);
		const leave = () => { close = setTimeout(() => popup.hidePopover(), 150); };
		trigger.addEventListener('mouseenter', () => { cancel(); show(); });
		trigger.addEventListener('mouseleave', leave);
		popup.addEventListener('mouseenter', cancel);
		popup.addEventListener('mouseleave', leave);
	}
};
