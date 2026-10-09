<?php
// CLI-only, isolated storage: php regression.php [path/to/lib.php]
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$source = file_get_contents($argv[1] ?? __DIR__ . '/lib.php');
if (!str_contains($source, "header('Content-Type: text/plain; charset=utf-8')") || str_contains($source, "header('Content-Type: application/json')")) throw new RuntimeException('Frontend requires string responses for explicit JSON.parse');
$start = strpos($source, '    function fv2_tailscale_status(');
$end = strpos($source, '    function readInfo(');
if ($start === false || $end === false) throw new RuntimeException('Missing test seam');
function fv2_debug_log($message) {}
class DockerUtil {
    public static $calls = 0;
    public static function tailscaleStatus($name) {
        self::$calls++;
        return ['Self' => ['DNSName' => 'test.example.ts.net.', 'TailscaleIPs' => ['::1', '100.64.0.1']]];
    }
}
eval(substr($source, $start, $end - $start));
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
function refuses(callable $operation) {
    try { $operation(); } catch (InvalidArgumentException | RuntimeException $error) { return; }
    throw new RuntimeException('Unsafe operation accepted');
}
$configDir = sys_get_temp_dir() . '/fv3-check-' . bin2hex(random_bytes(8));
mkdir($configDir, 0700);
$folder = ['name' => 'Test folder-1', 'icon' => '/plugins/icon.png', 'settings' => ['preview' => 1, 'preview_border_color' => '#ffffff', 'preview_text_width' => '40px'], 'regex' => '', 'containers' => ['test'], 'actions' => []];
try {
    check(readFolder('docker') === '{}', 'Initial JSON');
    foreach (['../docker', 'Docker', '', 'docker/../vm'] as $type) refuses(function () use ($type) { readFolder($type); });
    foreach (['bad-id', 'x\"', '../x'] as $id) refuses(function () use ($id, $folder) { updateFolder('docker', json_encode($folder), $id); });
    foreach (['name' => '<img>', 'icon' => 'javascript:alert(1)', 'settings' => 'bad', 'containers' => ['x\"']] as $key => $value) {
        $bad = $folder; $bad[$key] = $value;
        refuses(function () use ($bad) { updateFolder('docker', json_encode($bad), 'Test'); });
    }
    foreach (['data:image/svg+xml;base64,PHN2Zz4=', '/x\" onerror=alert(1)', '//evil/image'] as $icon) {
        $bad = $folder; $bad['icon'] = $icon;
        refuses(function () use ($bad) { validateFolder($bad); });
    }
    foreach (['fa:folder', 'fa:database', 'fa:cloud'] as $icon) {
        $preset = $folder; $preset['icon'] = $icon;
        validateFolder($preset);
    }
    $bad = $folder; $bad['icon'] = 'fa:unknown';
    refuses(function () use ($bad) { validateFolder($bad); });
    $bad = $folder; $bad['actions'] = [['name' => '<img src=x>', 'type' => 1, 'script_args' => 'ok']];
    refuses(function () use ($bad) { validateFolder($bad); });
    $folder['settings']['preview_vertical_bars_color'] = '#123456';
    validateFolder($folder);
    $bad = $folder; $bad['settings']['preview_vertical_bars_color'] = 'red;display:none';
    refuses(function () use ($bad) { validateFolder($bad); });
    updateFolder('docker', json_encode($folder), 'Test');
    deleteFolder('docker', 'Test');
    check(readFolder('docker') === '{}', 'Empty object after delete');
    foreach (['{broken', '[]', 'null'] as $corrupt) {
        file_put_contents("$configDir/docker.json", $corrupt);
        refuses(function () use ($folder) { updateFolder('docker', json_encode($folder), 'Test'); });
        refuses(function () { deleteFolder('docker', 'Test'); });
        check(file_get_contents("$configDir/docker.json") === $corrupt, 'Corrupt JSON changed');
    }
    file_put_contents("$configDir/docker.json", '{}');
    check(function_exists('pcntl_fork'), 'pcntl required for concurrency check');
    $children = [];
    for ($i = 0; $i < 12; $i++) {
        $pid = pcntl_fork();
        check($pid !== -1, 'Fork failed');
        if ($pid === 0) {
            for ($j = 0; $j < 10; $j++) updateFolder('docker', json_encode($folder), "Child{$i}Item{$j}");
            exit(0);
        }
        $children[] = $pid;
    }
    foreach ($children as $pid) {
        pcntl_waitpid($pid, $status);
        check(pcntl_wifexited($status) && pcntl_wexitstatus($status) === 0, 'Worker failed');
    }
    check(count(json_decode(readFolder('docker'), true)) === 120, 'Lost concurrent writes');
    check(fv2_get_tailscale_ip_from_container('test') === '100.64.0.1', 'Cached IPv4');
    check(fv2_get_tailscale_fqdn_from_container('test') === 'test.example.ts.net', 'Cached DNS');
    check(DockerUtil::$calls === 1, 'Repeated Tailscale lookup');
    for ($i = 0; $i < 100; $i++) check((bool)preg_match('/^[a-zA-Z0-9]{20}$/D', generateId()), 'Generated ID');
    echo "PASS: traversal, schema, icons, actions, corrupt JSON preservation, 120 concurrent writes, Tailscale cache, generated IDs\n";
} finally {
    foreach (glob("$configDir/*") as $file) unlink($file);
    rmdir($configDir);
}
