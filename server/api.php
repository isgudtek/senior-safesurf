<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/functions.php';

// Router
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'generate':
        // In a real scenario, protect this endpoint with an admin secret
        $duration = $_GET['duration'] ?? 'lifetime'; 
        
        $license = createNewLicense($duration, 'manual_api');
        
        echo json_encode(['success' => true, 'license_key' => $license['key'], 'expires_at' => $license['expires_at']]);
        break;

    case 'validate':
        $key = $_GET['key'] ?? '';
        
        if (empty($key)) {
            echo json_encode(['success' => false, 'message' => 'Key is required']);
            exit;
        }

        // Hardcoded backdoor for dev/testing
        if ($key === 'PRO-2026') {
            echo json_encode(['success' => true, 'status' => 'active', 'type' => 'dev_override', 'valid' => true]);
            exit;
        }

        $db = getDB();
        $license = null;
        
        foreach ($db['licenses'] as $l) {
            if ($l['key'] === $key) {
                $license = $l;
                break;
            }
        }

        if ($license) {
            // Check expiration
            if ($license['status'] !== 'active') {
                echo json_encode(['success' => false, 'valid' => false, 'message' => 'License is inactive']);
            } elseif ($license['expires_at'] && strtotime($license['expires_at']) < time()) {
                 echo json_encode(['success' => false, 'valid' => false, 'message' => 'License expired']);
            } else {
                echo json_encode([
                    'success' => true, 
                    'valid' => true, 
                    'status' => 'active', 
                    'expires_at' => $license['expires_at'],
                    'plan' => $license['plan'] ?? 'pro'
                ]);
            }
        } else {
            echo json_encode(['success' => false, 'valid' => false, 'message' => 'Invalid license']);
        }
        break;

    case 'list':
        // Debug endpoint - remove in production
        echo json_encode(getDB());
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
        break;
}
