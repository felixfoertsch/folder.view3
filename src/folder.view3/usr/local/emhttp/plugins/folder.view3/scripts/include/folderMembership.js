const folderPrefixValid = pattern => typeof pattern === 'string' && new TextEncoder().encode(pattern).length <= 256 && pattern === pattern.trim() && /^[^*\x00-\x1f\x7f<>"'`\\]+\*$/.test(pattern) && pattern.slice(0, -1).trim() !== '';
const folderPrefixFor = (name, prefixes = []) => prefixes.find(pattern => name.startsWith(pattern.slice(0, -1)));
// Prefixes define buckets; matching entries in containers enable and position those buckets.
const folderContainerNames = (folder, names) => {
	const result = [];
	for (const entry of folder.containers) {
		if (folder.prefixes?.includes(entry)) {
			result.push(...names.filter(name => folderPrefixFor(name, folder.prefixes) === entry));
		} else if (!folderPrefixFor(entry, folder.prefixes)) {
			result.push(entry);
		}
	}
	return [...new Set(result)];
};
