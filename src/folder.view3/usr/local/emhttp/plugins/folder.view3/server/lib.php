<?php
    define('FV2_DEBUG_MODE', false); // << SET TO true TO ENABLE LOGGING TO FILE >>
    $fv2_debug_log_file = "/tmp/folder_view2_php_debug.log"; 

    function fv2_debug_log($message) {
        if (FV2_DEBUG_MODE) {
            global $fv2_debug_log_file;
            $timestamp = date("Y-m-d H:i:s");
            if (is_array($message) || is_object($message)) {
                $message = json_encode($message);
            }
            @file_put_contents($fv2_debug_log_file, "[$timestamp] $message\n", FILE_APPEND);
        }
    }

    if (FV2_DEBUG_MODE && isset($_GET['type']) && basename($_SERVER['SCRIPT_NAME']) === 'read_info.php') {
        @file_put_contents($fv2_debug_log_file, "--- FolderView3 lib.php readInfo Start ---\n");
    }

    $folderVersion = 1.0;
    $configDir = "/boot/config/plugins/folder.view3";
    $sourceDir = "/usr/local/emhttp/plugins/folder.view3";
    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '/usr/local/emhttp';

    require_once("$documentRoot/webGui/include/Helpers.php");
    require_once("$documentRoot/plugins/dynamix.docker.manager/include/DockerClient.php");
    require_once ("$documentRoot/plugins/dynamix.vm.manager/include/libvirt_helpers.php");

    function fv2_tailscale_status(string $containerName): array {
        static $cache = [];
        if (!preg_match('/^[a-zA-Z0-9_.-]+$/D', $containerName)) return [];
        if (array_key_exists($containerName, $cache)) return $cache[$containerName];
        if (is_callable(['DockerUtil', 'tailscaleStatus'])) {
            $status = DockerUtil::tailscaleStatus($containerName);
            return $cache[$containerName] = is_array($status) ? $status : [];
        }
        // ponytail: older Unraid only; one bounded status command per container/request.
        $output = [];
        $code = -1;
        exec('timeout -k 1s 2s docker exec ' . escapeshellarg($containerName) . ' tailscale status --peers=false --json 2>/dev/null', $output, $code);
        $status = $code === 0 ? json_decode(implode("\n", $output), true) : null;
        return $cache[$containerName] = is_array($status) ? $status : [];
    }

    function fv2_get_tailscale_ip_from_container(string $containerName): ?string {
        if (empty($containerName) || !preg_match('/^[a-zA-Z0-9_.-]+$/', $containerName)) {
            fv2_debug_log("    fv2_get_tailscale_ip_from_container: Invalid container name for exec: $containerName");
            return null;
        }
        foreach (fv2_tailscale_status($containerName)['Self']['TailscaleIPs'] ?? [] as $ip) {
            if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return $ip;
        }
        return null;
    }

    function fv2_get_tailscale_fqdn_from_container(string $containerName): ?string {
        if (empty($containerName) || !preg_match('/^[a-zA-Z0-9_.-]+$/', $containerName)) {
            fv2_debug_log("    fv2_get_tailscale_fqdn_from_container: Invalid container name for exec: $containerName");
            return null;
        }
        $name = fv2_tailscale_status($containerName)['Self']['DNSName'] ?? '';
        return is_string($name) && preg_match('/^[a-zA-Z0-9.-]+$/D', $name) ? rtrim($name, '.') : null;
    }

    function validateType(string $type): void {
        if (!in_array($type, ['docker', 'vm'], true)) throw new InvalidArgumentException('Invalid folder type');
    }

    function validateId(string $id): void {
        if (!preg_match('/^[a-zA-Z0-9]{1,64}$/D', $id)) throw new InvalidArgumentException('Invalid folder ID');
    }

    function validateFolder($folder): void {
        if (!is_array($folder) || !isset($folder['name'], $folder['icon'], $folder['settings'], $folder['containers']) ||
            !is_string($folder['name']) || trim($folder['name']) === '' || strlen($folder['name']) > 256 ||
            !is_string($folder['icon']) || !is_array($folder['settings']) || !is_array($folder['containers'])) {
            throw new InvalidArgumentException('Invalid folder schema');
        }
        $icon = $folder['icon'];
        if (preg_match('/[\x00-\x20\x7f\x22\x27<>`\\\\]/', $icon) ||
            ($icon !== '' && !preg_match('~^(?:https?://[^/]+(?:/.*)?|/(?!/).*|data:image/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+=*)$~Di', $icon))) {
            throw new InvalidArgumentException('Invalid folder icon');
        }
        // Reject markup in every persisted string, including optional and future fields.
        $check = function ($value) use (&$check): void {
            if (is_array($value)) { foreach ($value as $item) $check($item); }
            elseif (is_string($value)) {
                if (strlen($value) > 1048576 || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/', $value)) throw new InvalidArgumentException('Invalid folder text');
            } elseif (!is_bool($value) && !is_int($value) && !is_float($value) && $value !== null) throw new InvalidArgumentException('Invalid folder value');
        };
        $check($folder);
        foreach ($folder['containers'] as $name) {
            if (!is_string($name) || preg_match('/[\x22\x27`\\\\]/', $name)) throw new InvalidArgumentException('Invalid container name');
        }
        if (isset($folder['regex']) && !is_string($folder['regex'])) throw new InvalidArgumentException('Invalid folder regex');
        foreach ($folder['settings'] as $key => $value) {
            if (in_array($key, ['preview', 'context', 'context_trigger', 'context_graph', 'context_graph_time'], true)) {
                if (!is_int($value) || $value < 0 || $value > ($key === 'context_graph_time' ? 86400 : 4)) throw new InvalidArgumentException('Invalid folder setting');
            } elseif ($key === 'preview_border_color') {
                if (!is_string($value) || !preg_match('/^#[a-fA-F0-9]{6}$/D', $value)) throw new InvalidArgumentException('Invalid border color');
            } elseif ($key === 'preview_text_width') {
                if (!is_string($value) || !preg_match('/^(?:[0-9]+(?:\.[0-9]+)?(?:px|em|rem|%|vw)?)?$/D', $value)) throw new InvalidArgumentException('Invalid preview width');
            } elseif (!is_bool($value)) throw new InvalidArgumentException('Invalid folder setting');
        }
        if (isset($folder['actions']) && !is_array($folder['actions'])) throw new InvalidArgumentException('Invalid folder actions');
        foreach ($folder['actions'] ?? [] as $action) {
            if (!is_array($action) || !isset($action['name'], $action['type']) || !is_string($action['name']) ||
                !preg_match('/^[a-zA-Z0-9_. -]+$/D', $action['name']) ||
                !is_int($action['type']) || !in_array($action['type'], [0, 1, 2], true)) throw new InvalidArgumentException('Invalid folder action');
            foreach (['action', 'modes'] as $key) {
                if (isset($action[$key]) && (!is_int($action[$key]) || $action[$key] < 0 || $action[$key] > 3)) throw new InvalidArgumentException('Invalid action mode');
            }
            foreach (['script', 'script_args'] as $key) {
                if (isset($action[$key]) && !is_string($action[$key])) throw new InvalidArgumentException('Invalid action script');
            }
            if (isset($action['script']) && ($action['script'] === '' || in_array($action['script'], ['.', '..'], true) || preg_match('/[\/\\\\\x22\x27`]/', $action['script']))) throw new InvalidArgumentException('Invalid script name');
            if (isset($action['script_sync']) && !is_bool($action['script_sync'])) throw new InvalidArgumentException('Invalid script mode');
            if (isset($action['script_icon']) && (!is_string($action['script_icon']) || !preg_match('/^(?:fa-[a-z0-9-]+(?: fa-[a-z0-9-]+)*)?$/D', $action['script_icon']))) throw new InvalidArgumentException('Invalid action icon');
            if (isset($action['conatiners'])) {
                if (!is_array($action['conatiners'])) throw new InvalidArgumentException('Invalid action containers');
                foreach ($action['conatiners'] as $name) {
                    if (!is_string($name) || preg_match('/[\x22\x27`\\\\]/', $name)) throw new InvalidArgumentException('Invalid action container');
                }
            }
        }
    }

    function folderFile(string $type, ?callable $mutate = null): string {
        global $configDir;
        validateType($type);
        if (!is_dir($configDir) && !mkdir($configDir, 0770, true) && !is_dir($configDir)) throw new RuntimeException('Cannot create folder directory');
        $path = "$configDir/$type.json";
        $lock = fopen("$path.lock", 'c');
        if ($lock === false) throw new RuntimeException('Cannot open folder lock');
        $temp = null;
        try {
            if (!flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock folder file');
            $exists = file_exists($path);
            $content = $exists ? file_get_contents($path) : '{}';
            if ($content === false) throw new RuntimeException('Cannot read folder file');
            $object = json_decode($content);
            if (json_last_error() !== JSON_ERROR_NONE || !is_object($object)) throw new RuntimeException('Corrupt folder JSON; refusing overwrite');
            $data = json_decode($content, true);
            foreach ($data as $id => $folder) {
                validateId((string)$id);
                validateFolder($folder);
            }
            if ($mutate !== null) $data = $mutate($data);
            if (!$exists || $mutate !== null) {
                $content = json_encode((object)$data, JSON_THROW_ON_ERROR);
                $temp = tempnam($configDir, ".$type-");
                if ($temp === false || dirname($temp) !== $configDir) throw new RuntimeException('Cannot create folder temporary file');
                if (file_put_contents($temp, $content) !== strlen($content) || !chmod($temp, $exists ? (fileperms($path) & 0777) : 0660) || !rename($temp, $path)) throw new RuntimeException('Cannot save folder file');
                $temp = null;
            }
            return $content;
        } finally {
            if ($temp !== null && is_file($temp)) unlink($temp);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    function readFolder(string $type) : string {
        return folderFile($type);
    }

    function readUserPrefs(string $type) : string {
        validateType($type);
        $userPrefsDir = "/boot/config/plugins";
        $prefsFilePath = '';
        if($type == 'docker') { $prefsFilePath = "$userPrefsDir/dockerMan/userprefs.cfg"; }
        elseif($type == 'vm') { $prefsFilePath = "$userPrefsDir/dynamix.vm.manager/userprefs.cfg"; }
        else { return '[]'; }
        if(!file_exists($prefsFilePath)) { return '[]'; }
        $parsedIni = @parse_ini_file($prefsFilePath);
        return json_encode($parsedIni ?: []);
    }
    
    function updateFolder(string $type, string $content, string $id = '') : void {
        validateType($type);
        if ($id === '') $id = generateId();
        validateId($id);
        $folder = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) throw new InvalidArgumentException('Invalid folder JSON');
        validateFolder($folder);
        folderFile($type, function ($data) use ($id, $folder) { $data[$id] = $folder; return $data; });
    }

    function deleteFolder(string $type, string $id) : void {
        validateType($type);
        validateId($id);
        folderFile($type, function ($data) use ($id) { unset($data[$id]); return $data; });
    }

    function generateId(int $length = 20) : string {
        $id = '';
        while (strlen($id) < $length) $id .= preg_replace('/[^a-zA-Z0-9]/', '', base64_encode(random_bytes($length)));
        return substr($id, 0, $length);
    }

    function folderRequest(array $input, array $keys, callable $handle): void {
        header('Content-Type: application/json');
        try {
            $args = [];
            foreach ($keys as $key) {
                if (!isset($input[$key]) || !is_string($input[$key])) throw new InvalidArgumentException('Missing or invalid request field');
                $args[] = $input[$key];
            }
            $result = $handle(...$args);
            if ($result !== null) echo is_string($result) ? $result : json_encode($result, JSON_THROW_ON_ERROR);
        } catch (InvalidArgumentException $error) {
            http_response_code(400);
            echo json_encode(['error' => $error->getMessage()]);
        } catch (Throwable $error) {
            http_response_code(500);
            echo json_encode(['error' => 'Folder operation failed; configuration unchanged']);
        }
    }

    function createFile(string $type): void {
        folderFile($type);
    }

    function readInfo(string $type): array {
        validateType($type);
        fv2_debug_log("readInfo called for type: $type");
        $info = [];
        if ($type == "docker") {
            global $dockerManPaths, $documentRoot;
            global $driver, $host; 
            if (!isset($driver) || !is_array($driver)) { $driver = DockerUtil::driver(); fv2_debug_log("Initialized \$driver: " . json_encode($driver)); }
            if (!isset($host)) { $host = DockerUtil::host(); fv2_debug_log("Initialized \$host: " . $host); }

            $dockerClient = new DockerClient();
            $DockerUpdate = new DockerUpdate();
            $dockerTemplates = new DockerTemplates();

            $cts = $dockerClient->getDockerJSON("/containers/json?all=1");
            $autoStartFile = $dockerManPaths['autostart-file'] ?? "/var/lib/docker/unraid-autostart";
            $autoStartLines = @file($autoStartFile, FILE_IGNORE_NEW_LINES) ?: [];
            $autoStart = array_map('var_split', $autoStartLines);

            $allXmlTemplates = [];
            foreach ($dockerTemplates->getTemplates('all') as $templateFile) {
                $doc = new DOMDocument();
                if (@$doc->load($templateFile['path'])) { 
                    $templateName = trim($doc->getElementsByTagName('Name')->item(0)->nodeValue ?? '');
                    $templateImage = DockerUtil::ensureImageTag($doc->getElementsByTagName('Repository')->item(0)->nodeValue ?? '');
                    if ($templateName && $templateImage) {
                        $allXmlTemplates[$templateName . '|' . $templateImage] = [
                            'WebUi'             => trim($doc->getElementsByTagName('WebUI')->item(0)->nodeValue ?? ''),
                            'TSUrlRaw'          => trim($doc->getElementsByTagName('TailscaleWebUI')->item(0)->nodeValue ?? ''),
                            'TSServeMode'       => trim($doc->getElementsByTagName('TailscaleServe')->item(0)->nodeValue ?? 'no'),
                            'TSTailscaleEnabled'=> strtolower(trim($doc->getElementsByTagName('TailscaleEnabled')->item(0)->nodeValue ?? 'false')) === 'true',
                            'registry'          => trim($doc->getElementsByTagName('Registry')->item(0)->nodeValue ?? ''),
                            'Support'           => trim($doc->getElementsByTagName('Support')->item(0)->nodeValue ?? ''),
                            'Project'           => trim($doc->getElementsByTagName('Project')->item(0)->nodeValue ?? ''),
                            'DonateLink'        => trim($doc->getElementsByTagName('DonateLink')->item(0)->nodeValue ?? ''),
                            'ReadMe'            => trim($doc->getElementsByTagName('ReadMe')->item(0)->nodeValue ?? ''),
                            'Shell'             => trim($doc->getElementsByTagName('Shell')->item(0)->nodeValue ?? 'sh'),
                            'path'              => $templateFile['path']
                        ];
                    }
                }
            }
            unset($doc);
            // fv2_debug_log("Pre-parsed " . count($allXmlTemplates) . " XML templates.");

            foreach ($cts as $key => &$ct) {
                $ct['info'] = $dockerClient->getContainerDetails($ct['Id']);
                if (empty($ct['info'])) { fv2_debug_log("Skipped container due to empty details: ID " . ($ct['Id'] ?? 'N/A')); continue; }

                $containerName = substr($ct['info']['Name'], 1);
                $ct['info']['Name'] = $containerName;
                fv2_debug_log("Processing Container: $containerName (ID: " . ($ct['Id'] ?? 'N/A') . ")");

                $ct['info']['State']['Autostart'] = in_array($containerName, $autoStart);
                $ct['info']['Config']['Image'] = DockerUtil::ensureImageTag($ct['info']['Config']['Image']);
                $ct['info']['State']['Updated'] = $DockerUpdate->getUpdateStatus($ct['info']['Config']['Image']);
                $ct['info']['State']['manager'] = $ct['Labels']['net.unraid.docker.managed'] ?? false;
                $ct['shortId'] = substr(str_replace('sha256:', '', $ct['Id']), 0, 12);
                $ct['shortImageId'] = substr(str_replace('sha256:', '', $ct['ImageID']), 0, 12);
                $ct['info']['State']['WebUi'] = ''; $ct['info']['State']['TSWebUi'] = '';
                $ct['info']['Shell'] = 'sh'; $ct['info']['template'] = null;
                $rawWebUiString = ''; $rawTsXmlUrl = ''; $tsServeModeFromXml = 'no';
                $isTailscaleEnabledForContainer = false;

                $templateKey = $containerName . '|' . $ct['info']['Config']['Image'];
                $templateData = $allXmlTemplates[$templateKey] ?? null;

                if ($ct['info']['State']['manager'] == 'dockerman' && !is_null($templateData)) {
                    $rawWebUiString = $templateData['WebUi']; $rawTsXmlUrl = $templateData['TSUrlRaw'];
                    $tsServeModeFromXml = $templateData['TSServeMode'];
                    $isTailscaleEnabledForContainer = $templateData['TSTailscaleEnabled'];
                    $ct['info']['registry'] = $templateData['registry']; $ct['info']['Support'] = $templateData['Support']; $ct['info']['Project'] = $templateData['Project']; $ct['info']['DonateLink'] = $templateData['DonateLink']; $ct['info']['ReadMe'] = $templateData['ReadMe']; $ct['info']['Shell'] = $templateData['Shell'] ?: 'sh'; $ct['info']['template'] = ['path' => $templateData['path']];
                } else {
                    $rawWebUiString = $ct['Labels']['net.unraid.docker.webui'] ?? '';
                    $rawTsXmlUrl = $ct['Labels']['net.unraid.docker.tailscale.webui'] ?? '';
                    $tsServeModeFromXml = $ct['Labels']['net.unraid.docker.tailscale.servemode'] ?? ($ct['Labels']['net.unraid.docker.tailscale.funnel'] === 'true' ? 'funnel' : 'no');
                    $isTailscaleEnabledForContainer = strtolower($ct['Labels']['net.unraid.docker.tailscale.enabled'] ?? 'false') === 'true';
                    $ct['info']['Shell'] = $ct['Labels']['net.unraid.docker.shell'] ?? 'sh';
                }
                fv2_debug_log("  $containerName: Using ".($templateData && $ct['info']['State']['manager'] == 'dockerman' ? "XML" : "Label")." data. TailscaleEnabled: " . ($isTailscaleEnabledForContainer ? 'true' : 'false'));
                fv2_debug_log("    $containerName: Raw WebUI: '$rawWebUiString', Raw TS XML URL: '$rawTsXmlUrl', TS Serve Mode: '$tsServeModeFromXml'");
                
                // --- Populate $ct['info']['Ports'] ---
                $ct['info']['Ports'] = [];
                $currentNetworkMode = $ct['HostConfig']['NetworkMode'] ?? 'unknown';
                $currentNetworkDriver = $driver[$currentNetworkMode] ?? null;
                
                $containerIpAddress = null; 
                if ($currentNetworkMode !== 'host' && $currentNetworkDriver !== 'bridge') {
                    $containerNetworkSettings = $ct['NetworkSettings']['Networks'][$currentNetworkMode] ?? null;
                    if ($containerNetworkSettings && !empty($containerNetworkSettings['IPAddress'])) { $containerIpAddress = $containerNetworkSettings['IPAddress']; }
                } elseif ($currentNetworkMode === 'host') {
                    $containerIpAddress = $host; 
                }
                fv2_debug_log("  $containerName: NetworkMode: $currentNetworkMode, Driver: " . ($currentNetworkDriver ?: 'N/A') . ", ContainerIP (for custom/host): " . ($containerIpAddress ?: 'N/A'));
                fv2_debug_log("  $containerName: HostConfig.PortBindings: " . json_encode($ct['info']['HostConfig']['PortBindings'] ?? []));
                fv2_debug_log("  $containerName: Config.ExposedPorts: " . json_encode($ct['info']['Config']['ExposedPorts'] ?? []));

                if (isset($ct['info']['HostConfig']['PortBindings']) && is_array($ct['info']['HostConfig']['PortBindings']) && !empty($ct['info']['HostConfig']['PortBindings'])) {
                    fv2_debug_log("  $containerName: Processing HostConfig.PortBindings...");
                    foreach ($ct['info']['HostConfig']['PortBindings'] as $containerPortProtocol => $hostBindings) {
                        if (is_array($hostBindings) && !empty($hostBindings)) {
                            list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                            $protocol = strtoupper($protocol ?: 'TCP');
                            $hostBinding = $hostBindings[0];
                            $publicIp = ($hostBinding['HostIp'] === '0.0.0.0' || empty($hostBinding['HostIp'])) ? $host : $hostBinding['HostIp'];
                            $publicPort = $hostBinding['HostPort'] ?? null; 

                            fv2_debug_log("    $containerName Binding: Private=$privatePort/$protocol, Public=$publicIp:" . ($publicPort ?: 'N/A'));
                            $ct['info']['Ports'][] = [
                                'PrivateIP'   => null, // For bridge mappings, the "private IP" is internal to Docker, not usually the container's specific IP on another net
                                'PrivatePort' => $privatePort,
                                'PublicIP'    => $publicIp,
                                'PublicPort'  => $publicPort, 
                                'NAT'         => true, 
                                'Type'        => $protocol
                            ];
                        }
                    }
                } elseif (isset($ct['info']['Config']['ExposedPorts']) && is_array($ct['info']['Config']['ExposedPorts'])) {
                    fv2_debug_log("  $containerName: Processing Config.ExposedPorts (Network: $currentNetworkMode)...");
                    foreach ($ct['info']['Config']['ExposedPorts'] as $containerPortProtocol => $emptyValue) {
                        list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                        $protocol = strtoupper($protocol ?: 'TCP');
                        
                        $effectiveIp = null;
                        $effectivePort = $privatePort; 

                        if ($currentNetworkMode === 'host') {
                            $effectiveIp = $host;
                        } elseif ($currentNetworkMode !== 'none' && $containerIpAddress) {
                            $effectiveIp = $containerIpAddress;
                        }
                        
                        fv2_debug_log("    $containerName Exposed: Private=$privatePort/$protocol, EffectiveIP=" . ($effectiveIp ?: 'null') . ", EffectivePort=$effectivePort");
                        $ct['info']['Ports'][] = [
                            'PrivateIP'   => $containerIpAddress, 
                            'PrivatePort' => $privatePort,
                            'PublicIP'    => $effectiveIp, 
                            'PublicPort'  => $effectivePort, 
                            'NAT'         => false,
                            'Type'        => $protocol
                        ];
                     }
                }
                
                if ($currentNetworkMode === 'none') {
                    fv2_debug_log("  $containerName: NetworkMode is 'none'. Adjusting public port aspects.");
                    $tempPorts = [];
                    if(isset($ct['info']['Config']['ExposedPorts']) && is_array($ct['info']['Config']['ExposedPorts'])){
                        foreach($ct['info']['Config']['ExposedPorts'] as $containerPortProtocol => $emptyValue) {
                            list($privatePort, $protocol) = explode('/', $containerPortProtocol);
                            $protocol = strtoupper($protocol ?: 'TCP');
                            $tempPorts[] = [
                                'PrivateIP'   => null, // No specific container IP accessible
                                'PrivatePort' => $privatePort,
                                'PublicIP'    => null,
                                'PublicPort'  => null, 
                                'NAT'         => false, 
                                'Type'        => $protocol
                            ];
                        }
                    }
                    $ct['info']['Ports'] = $tempPorts;
                }
                ksort($ct['info']['Ports']);
                fv2_debug_log("  $containerName: Final ct[info][Ports]: " . json_encode($ct['info']['Ports']));

                $finalWebUi = '';
                if (!empty($rawWebUiString)) {
                    if (strpos($rawWebUiString, '[IP]') === false && strpos($rawWebUiString, '[PORT:') === false) { $finalWebUi = $rawWebUiString; } 
                    else {
                        $webUiIp = $host; 
                        if ($currentNetworkMode === 'host') { $webUiIp = $host; } 
                        elseif ($currentNetworkDriver !== 'bridge' && $containerIpAddress) { $webUiIp = $containerIpAddress; }
                        if (strpos($currentNetworkMode, 'container:') === 0 || $currentNetworkMode === 'none') { $finalWebUi = ''; } 
                        else {
                            $tempWebUi = str_replace("[IP]", $webUiIp ?: '', $rawWebUiString);
                            if (preg_match("%\[PORT:(\d+)\]%", $tempWebUi, $matches)) {
                                $internalPortFromTemplate = $matches[1]; $mappedPublicPort = $internalPortFromTemplate; 
                                foreach ($ct['info']['Ports'] as $p) {
                                    if (isset($p['PrivatePort']) && $p['PrivatePort'] == $internalPortFromTemplate) {
                                        $isNatEquivalent = (($p['NAT'] ?? false) === true);
                                        $mappedPublicPort = ($isNatEquivalent && !empty($p['PublicPort'])) ? $p['PublicPort'] : $p['PrivatePort'];
                                        break;
                                    }
                                }
                                $tempWebUi = preg_replace("%\[PORT:\d+\]%", $mappedPublicPort, $tempWebUi);
                            }
                            $finalWebUi = $tempWebUi;
                        }
                    }
                }
                $ct['info']['State']['WebUi'] = $finalWebUi;
                fv2_debug_log("  $containerName: Resolved Standard WebUi: '$finalWebUi'");
                
                $finalTsWebUi = '';
                if ($isTailscaleEnabledForContainer && !empty($ct['info']['State']['Running'])) {
                    fv2_debug_log("  $containerName: Tailscale is ENABLED. Attempting to resolve TS WebUI.");
                    $baseTsTemplateFromHelper = '';
                    if (!empty($rawTsXmlUrl)) { 
                        $baseTsTemplateFromHelper = generateTSwebui($rawTsXmlUrl, $tsServeModeFromXml, $rawWebUiString); 
                    } elseif (!empty($ct['Labels']['net.unraid.docker.tailscale.webui'])) {
                        $baseTsTemplateFromHelper = $ct['Labels']['net.unraid.docker.tailscale.webui'];
                    }
                    fv2_debug_log("    $containerName: Base TS WebUI from generateTSwebui/label: '$baseTsTemplateFromHelper'");

                    if (!empty($baseTsTemplateFromHelper)) {
                        if (strpos($baseTsTemplateFromHelper, '[hostname]') !== false || strpos($baseTsTemplateFromHelper, '[HOSTNAME]') !== false) {
                            $tsFqdn = fv2_get_tailscale_fqdn_from_container($containerName); 
                            if ($tsFqdn) {
                                $finalTsWebUi = str_replace(["[hostname][magicdns]", "[HOSTNAME][MAGICDNS]"], $tsFqdn, $baseTsTemplateFromHelper);
                                if (strpos($baseTsTemplateFromHelper, 'http://[hostname]') === 0) {
                                    $finalTsWebUi = str_replace('http://', 'https://', $finalTsWebUi);
                                }
                            } else { fv2_debug_log("    $containerName: TS WebUI: Could not resolve [hostname] via exec."); $finalTsWebUi = ''; }
                        } elseif (strpos($baseTsTemplateFromHelper, '[noserve]') !== false || strpos($baseTsTemplateFromHelper, '[NOSERVE]') !== false) {
                            $tsIP = fv2_get_tailscale_ip_from_container($containerName); 
                            if ($tsIP) {
                                $finalTsWebUi = str_replace(["[noserve]", "[NOSERVE]"], $tsIP, $baseTsTemplateFromHelper);
                                $internalPortForTS = null;
                                if (preg_match('/\[PORT:(\d+)\]/i', $baseTsTemplateFromHelper, $portMatches)) { 
                                    $internalPortForTS = $portMatches[1];
                                } elseif (preg_match('/\[PORT:(\d+)\]/i', $rawWebUiString, $portMatches)) { 
                                    $internalPortForTS = $portMatches[1];
                                } elseif (preg_match('/:(\d+)/', $finalTsWebUi, $portMatchesNoserve)) { 
                                    $internalPortForTS = $portMatchesNoserve[1];
                                }
                                
                                if ($internalPortForTS !== null) {
                                   $finalTsWebUi = preg_replace('/\[PORT:\d+\]/i', $internalPortForTS, $finalTsWebUi);
                                   if (strpos($baseTsTemplateFromHelper, '[noserve]:[PORT:') === false && preg_match('/:(\d+)/', $baseTsTemplateFromHelper, $portMatchesRawBase)) {
                                       if ($portMatchesRawBase[1] != $internalPortForTS) { 
                                          $finalTsWebUi = str_replace(":$portMatchesRawBase[1]", ":$internalPortForTS", $finalTsWebUi);
                                       }
                                   }
                                }
                            } else { fv2_debug_log("    $containerName: TS WebUI: Could not resolve [noserve] via exec."); $finalTsWebUi = ''; }
                        } else {
                            $finalTsWebUi = $baseTsTemplateFromHelper; 
                        }
                    }
                } else {
                    fv2_debug_log("  $containerName: Tailscale is NOT enabled or no TS URL defined in template/label.");
                }
                $ct['info']['State']['TSWebUi'] = $finalTsWebUi;
                fv2_debug_log("  $containerName: Resolved TS WebUi: '$finalTsWebUi'");
                
                $info[$containerName] = $ct;
            }
            unset($ct); 

        } elseif ($type == "vm") {
            global $lv;
            if (!isset($lv)) { 
                $lv = new Libvirt();
                if (!$lv->connect()) { fv2_debug_log("VM: Libvirt connection failed."); return []; }
            }
            $vms = $lv->get_domains();
            fv2_debug_log("VM: Found " . count($vms) . " VMs.");
            if (!empty($vms)) {
                foreach ($vms as $vm) {
                    $res = $lv->get_domain_by_name($vm);
                    if (!$res) { fv2_debug_log("VM: Could not get domain by name for $vm."); continue; }
                    $dom = $lv->domain_get_info($res);
                    $info[$vm] = [
                        'uuid' => $lv->domain_get_uuid($res), 'name' => $vm,
                        'description' => $lv->domain_get_description($res),
                        'autostart' => $lv->domain_get_autostart($res),
                        'state' => $lv->domain_state_translate($dom['state']),
                        'icon' => $lv->domain_get_icon_url($res),
                        'logs' => (is_file("/var/log/libvirt/qemu/$vm.log") ? "libvirt/qemu/$vm.log" : '')
                    ];
                }
            }
        }
        fv2_debug_log("readInfo for type: $type completed.");
        return $info;
    }

    function readUnraidOrder(string $type): array {
        validateType($type);
        fv2_debug_log("readUnraidOrder called for type: $type");
        $user_prefs_path = "/boot/config/plugins";
        $order = [];
        if ($type == "docker") {
            $dockerClient = new DockerClient();
            $containersFromUnraid = $dockerClient->getDockerContainers(); 
            $prefs_file = "$user_prefs_path/dockerMan/userprefs.cfg";

            if (file_exists($prefs_file)) {
                $prefs_ini = @parse_ini_file($prefs_file);
                if ($prefs_ini) { 
                    $prefs_array = array_values($prefs_ini);
                    $sort = [];
                    $count_containers = count($containersFromUnraid);
                    foreach ($containersFromUnraid as $ct_item)  { 
                        $search = array_search($ct_item['Name'], $prefs_array);
                        $sort[] = ($search === false) ? ($count_containers + count($sort) + 1) : $search; 
                    }
                    if (!empty($sort)) { 
                         @array_multisort($sort,SORT_NUMERIC,$containersFromUnraid);
                    } else { 
                         @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
                    }
                } else { 
                    @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
                }
            } else { 
                 @usort($containersFromUnraid, function($a, $b) { return strnatcasecmp($a['Name'], $b['Name']); });
            }
            $order = array_column($containersFromUnraid, 'Name');

        } elseif ($type == "vm") {
            global $lv;
            if (!isset($lv)) { $lv = new Libvirt(); if (!$lv->connect()) { fv2_debug_log("VM Order: Libvirt connection failed."); return []; } }

            $prefs_file = "$user_prefs_path/dynamix.vm.manager/userprefs.cfg";
            $vms = $lv->get_domains();

            if (!empty($vms)) {
                if (file_exists($prefs_file)) {
                    $prefs_ini = @parse_ini_file($prefs_file);
                     if ($prefs_ini) {
                        $prefs_array = array_values($prefs_ini);
                        $sort = [];
                        $count_vms = count($vms);
                        foreach ($vms as $vm_name) {
                            $search = array_search($vm_name, $prefs_array);
                            $sort[] = ($search === false) ? ($count_vms + count($sort) + 1) : $search;
                        }
                        if (!empty($sort)) {
                            @array_multisort($sort, SORT_NUMERIC, $vms);
                        } else {
                             natcasesort($vms);
                        }
                    } else {
                       natcasesort($vms);
                    }
                } else {
                    natcasesort($vms);
                }
                $order = array_values($vms);
            }
        }
        fv2_debug_log("readUnraidOrder for type: $type completed. Order: " . json_encode($order));
        return $order;
    }
    function pathToMultiDimArray($dir) {
        $final = [];
        try {
            if (!is_dir($dir) || !is_readable($dir)) return $final;
            $elements = array_diff(scandir($dir), ['.', '..']);
            foreach ($elements as $el) {
                $newEl = "{$dir}/{$el}";
                if(is_dir($newEl)) {
                    array_push($final, ["name" => $el, "path" => $newEl, "sub" => pathToMultiDimArray($newEl)]);
                } else if(is_file($newEl)) {
                    array_push($final, ["name" => $el, "path" => $newEl]);
                }
            }
        } catch (Throwable $err) { fv2_debug_log("Error in pathToMultiDimArray for $dir: " . $err->getMessage()); }
        return $final;
    }
    function dirToArrayOfFiles($dir, $fileFilter = NULL, $folderFilter = NULL) {
        $final = [];
        if (!is_array($dir)) return $final; 
        foreach ($dir as $el) {
            if (!is_array($el) || !isset($el['name'])) continue; 
            if(isset($el['sub']) && (!isset($folderFilter) || (isset($folderFilter) && !preg_match($folderFilter, $el['name'])))) {
                $final = array_merge($final, dirToArrayOfFiles($el['sub'], $fileFilter, $folderFilter));
            } else if(!isset($el['sub']) && (!isset($fileFilter) || (isset($fileFilter) && preg_match($fileFilter, $el['name'])))) {
                array_push($final, $el);
            }
        }
        return $final;
    }
?>