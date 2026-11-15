<?php
/**
 * Shared Functions & Configuration
 */

// Stripe API Key (TEST MODE)
define('STRIPE_SECRET_KEY', getenv('STRIPE_SECRET_KEY') ?: '');
define('STRIPE_PUBLIC_KEY', getenv('STRIPE_PUBLIC_KEY') ?: '');
// LIVE MODE (Commented for easy switching)

// Database File Path
$dbFile = __DIR__ . '/licenses.json';

// Initialize DB if not exists
if (!file_exists($dbFile)) {
    // Attempt to create it. Note: Directory must be writable.
    file_put_contents($dbFile, json_encode(['licenses' => []]));
}

// Load Composer Autoloader if available (for Stripe)
// Users must run 'composer require stripe/stripe-php' in this directory
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);
}

// Helper to read DB
function getDB() {
    global $dbFile;
    if (!file_exists($dbFile)) return ['licenses' => []];
    $data = file_get_contents($dbFile);
    return json_decode($data, true) ?? ['licenses' => []];
}

// Helper to write DB
function saveDB($data) {
    global $dbFile;
    file_put_contents($dbFile, json_encode($data, JSON_PRETTY_PRINT));
}

// Helper to generate a random license key
function generateLicenseKey() {
    return 'PRO-' . strtoupper(bin2hex(random_bytes(2))) . '-' . strtoupper(bin2hex(random_bytes(2))) . '-' . date('Y');
}

// Helper: Create and Save a new License
function createNewLicense($duration = 'lifetime', $source = 'api', $subscriptionId = null) {
    $db = getDB();
    $newKey = generateLicenseKey();
    
    $expiresAt = null;
    if ($duration === 'weekly') {
        $expiresAt = date('c', strtotime('+8 days')); // 7 days + 1 day buffer
    } elseif ($duration === 'monthly') {
        $expiresAt = date('c', strtotime('+31 days')); // +1 day buffer
    } elseif ($duration === 'yearly') {
        $expiresAt = date('c', strtotime('+366 days')); // +1 day buffer
    }
    
    $licenseData = [
        'key' => $newKey,
        'created_at' => date('c'),
        'expires_at' => $expiresAt,
        'status' => 'active',
        'type' => 'pro',
        'plan' => $duration,
        'source' => $source,
        'subscription_id' => $subscriptionId
    ];
    
    $db['licenses'][] = $licenseData;
    saveDB($db);
    
    return $licenseData;
}

// Helper: Extend License Integration
function extendLicense($subscriptionId, $period = 'month') {
    if (!$subscriptionId) return false;
    
    $db = getDB();
    $updated = false;
    
    foreach ($db['licenses'] as &$license) {
        if (isset($license['subscription_id']) && $license['subscription_id'] === $subscriptionId) {
            
            // Calculate new expiry
            $currentExpiry = strtotime($license['expires_at']);
            $now = time();
            
            // If expired, start from now. If active, add to current expiry.
            $baseTime = ($currentExpiry > $now) ? $currentExpiry : $now;
            
            if ($period === 'month') {
                $license['expires_at'] = date('c', strtotime('+31 days', $baseTime));
            } elseif ($period === 'year') {
                $license['expires_at'] = date('c', strtotime('+366 days', $baseTime));
            }
            
            $license['status'] = 'active'; // Reactivate if was expired
            $updated = true;
            break;
        }
    }
    
    if ($updated) {
        saveDB($db);
    }
    
    return $updated;
}
