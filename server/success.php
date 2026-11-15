<?php
require_once __DIR__ . '/functions.php';

$sessionId = $_GET['session_id'] ?? null;

if (!$sessionId) {
    die("Error: No session ID provided.");
}

try {
    // 1. Retrieve the session from Stripe to verify payment
    $session = \Stripe\Checkout\Session::retrieve($sessionId);

    if ($session->payment_status !== 'paid') {
        die("Error: Payment not completed.");
    }

    // 2. Check if we already generated a key for this session (Idempotency)
    // In a simple JSON DB, we loop to check 'source' field.
    $db = getDB();
    $existingLicense = null;
    foreach ($db['licenses'] as $l) {
        if (isset($l['source']) && $l['source'] === "stripe:$sessionId") {
            $existingLicense = $l;
            break;
        }
    }

    if ($existingLicense) {
        $licenseKey = $existingLicense['key'];
        $plan = $existingLicense['plan'];
    } else {
        // 3. Generate New License
        $plan = $session->metadata->plan_type ?? 'lifetime';
        $subId = $session->subscription ?? null; // Get Stripe Sub ID
        
        $newLicense = createNewLicense($plan, "stripe:$sessionId", $subId);
        $licenseKey = $newLicense['key'];
    }

} catch (Exception $e) {
    die("Error verifying payment: " . $e->getMessage());
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Purchase Successful | Senior SafeSurf</title>
    <style>
        body {
            background-color: #0f172a;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .card {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 40px;
            border-radius: 16px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        h1 { color: #10b981; margin-bottom: 8px; }
        .key-box {
            background: #0f172a;
            border: 2px dashed #3b82f6;
            padding: 16px;
            margin: 24px 0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 18px;
            letter-spacing: 1px;
            color: #3b82f6;
            word-break: break-all;
        }
        .copy-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.2s;
        }
        .copy-btn:hover { opacity: 0.9; }
        .sub-text { font-size: 14px; color: #94a3b8; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h1>Payment Successful!</h1>
        <p>You are now a PRO member.</p>
        
        <div class="key-box" id="licenseKey"><?php echo htmlspecialchars($licenseKey); ?></div>
        
        <button class="copy-btn" onclick="copyKey()">Copy License Key</button>
        
        <p class="sub-text">
            1. Copy this key.<br>
            2. Open Senior SafeSurf Settings.<br>
            3. Paste and Activate.
        </p>
    </div>

    <script>
        function copyKey() {
            const key = document.getElementById('licenseKey').innerText;
            navigator.clipboard.writeText(key).then(() => {
                const btn = document.querySelector('.copy-btn');
                btn.textContent = "Copied!";
                setTimeout(() => btn.textContent = "Copy License Key", 2000);
            });
        }
    </script>
</body>
</html>
