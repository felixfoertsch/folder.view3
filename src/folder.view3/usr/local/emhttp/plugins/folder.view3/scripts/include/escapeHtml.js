// Escape text and quoted attributes at HTML interpolation boundaries.
const folderHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
