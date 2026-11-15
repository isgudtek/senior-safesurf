<?php
/**
 * Stripe Checkout Endpoint
 * URL: /server/checkout.php?plan=monthly
 */

require_once __DIR__ . '/functions.php';

// Base URL for redirects (Detects HTTPS automatically)
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
$baseUrl = $protocol . "://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);

$plan = $_GET['plan'] ?? 'monthly';

// Configuration: Define your prices here (USD Cents)
$prices = [
    'weekly' => [
        'amount' => 199, // $1.99
        'name' => 'Senior SafeSurf PRO (Weekly)',
        'interval' => 'week'
    ],
    'monthly' => [
        'amount' => 499, // $4.99
        'name' => 'Senior SafeSurf PRO (Monthly)',
        'interval' => 'month'
    ],
    'yearly' => [
        'amount' => 3999, // $39.99
        'name' => 'Senior SafeSurf PRO (Yearly)',
        'interval' => 'year'
    ],
    'lifetime' => [
        'amount' => 6999, // $69.99
        'name' => 'Senior SafeSurf PRO (Lifetime)',
        'interval' => null // One-time
    ]
];

if (!isset($prices[$plan])) {
    die("Invalid plan selected.");
}

$selectedPrice = $prices[$plan];

try {
    // Dynamic price creation allows the code to work with ANY secret key (Test or Live)
    // without needing to pre-create Price IDs in the Stripe Dashboard.
    $lineItem = [
        'price_data' => [
            'currency' => 'usd',
            'product_data' => [
                'name' => $selectedPrice['name'],
                'images' => ['https://i.imgur.com/Zu77C3A.png'], // Standard shield logo
            ],
            'unit_amount' => $selectedPrice['amount'],
        ],
        'quantity' => 1,
    ];

    $mode = 'payment'; // Default for one-time
    if ($selectedPrice['interval']) {
        $mode = 'subscription';
        $lineItem['price_data']['recurring'] = ['interval' => $selectedPrice['interval']];
    }

    $session = \Stripe\Checkout\Session::create([
        'payment_method_types' => ['card'],
        'line_items' => [$lineItem],
        'mode' => $mode,
        'metadata' => [
            'plan_type' => $plan
        ],
        'success_url' => $baseUrl . '/success.php?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url'  => $baseUrl . '/cancel.php',
    ]);

    // Redirect to Stripe
    header("Location: " . $session->url);
    exit;

} catch (Exception $e) {
    echo "Error creating session: " . $e->getMessage();
}
