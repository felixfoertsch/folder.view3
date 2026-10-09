// Escape text and quoted attributes at HTML interpolation boundaries.
const folderHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const folderIconPresets = ['folder', 'film', 'music', 'picture-o', 'download', 'globe', 'shield', 'archive', 'hdd-o', 'database', 'code', 'wrench', 'bar-chart', 'home', 'gamepad', 'cloud'];
const folderIconHtml = (icon, classes = '') => folderIconPresets.includes(String(icon).replace(/^fa:/, '')) && String(icon).startsWith('fa:')
	? `<i class="img fa fa-${icon.slice(3)} ${folderHtml(classes)}" aria-hidden="true" style="display:inline-block;width:32px;height:32px;line-height:32px;font-size:28px;text-align:center;vertical-align:middle"></i>`
	: `<img src="${folderHtml(icon)}" class="img ${folderHtml(classes)}" alt="" onerror="this.onerror=null;this.src='/plugins/dynamix.docker.manager/images/question.png';">`;
