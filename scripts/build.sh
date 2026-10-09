#!/usr/bin/env bash
set -euo pipefail

main() {
	local version="${1:?Usage: scripts/build.sh YYYY.MM.DD[.N]}"
	local root output package
	[[ "$version" =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[0-9]+)?$ ]] || { printf 'Invalid version: %s\n' "$version" >&2; return 1; }
	root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
	output="$root/dist/$version"
	package="$output/folder.view3-$version.txz"
	mkdir -p "$output"
	tar -cJf "$package" -C "$root/src/folder.view3" usr
	node - "$root/folder.view3.plg" "$package" "$output/folder.view3.plg" "$version" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [template, archive, output, version] = process.argv.slice(2);
let plugin = fs.readFileSync(template, 'utf8');
const values = { version, md5: crypto.createHash('md5').update(fs.readFileSync(archive)).digest('hex') };
for (const [key, value] of Object.entries(values)) {
	const pattern = new RegExp(`<!ENTITY ${key} "[^"]*">`, 'g');
	if ([...plugin.matchAll(pattern)].length !== 1) throw new Error(`Expected one ${key} entity`);
	plugin = plugin.replace(pattern, `<!ENTITY ${key} "${value}">`);
}
plugin = plugin.replace('<CHANGES>', `<CHANGES>\n\n###${version}\n- Compact two-column folder editor with preserved assignment order and reliable exports.\n- Correct VM custom actions, dashboard restart and new-folder refresh handling.\n- Validate configuration boundaries, save atomically under lock and escape folder HTML.\n- Bound and cache Tailscale lookups; preserve Folder View 2 import and labels.`);
fs.writeFileSync(output, plugin);
NODE
	printf 'Built %s\n' "$output"
}

main "$@"
