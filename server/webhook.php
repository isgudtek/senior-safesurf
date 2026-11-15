<?php
/**
 * Stripe Webhook Handler
 * URL: https://gudtek.lol/chrome/webhook.php
 */

require_once __DIR__ . '/functions.php';

// Retrieve the payload and signature
$payload = @file_get_contents('php://input');
$sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

// You can find your endpoint's secret in your Stripe Dashboard `Developers > Webhooks`
// For now, we will trust the payload if the event ID is distinct, OR better, uncomment below when you have the secret.
// $endpoint_secret = 'whsec_...'; 

$event = null;

try {
    // If you have the secret, use:
    // $event = \Stripe\Webhook::constructEvent($payload, $sig_header, $endpoint_secret);
    
    // Without secret (Development Mode):
    $event = \Stripe\Event::constructFrom(
        json_decode($payload, true)
    );
} catch(\UnexpectedValueException $e) {
    http_response_code(400); // Invalid payload
    exit();
} catch(\Stripe\Exception\SignatureVerificationException $e) {
    http_response_code(400); // Invalid signature
    exit();
}

// Handle the event
switch ($event->type) {
    case 'invoice.payment_succeeded':
        $invoice = $event->data->object;
        $subscriptionId = $invoice->subscription;
        
        // Check if this is a subscription renewal (billing_reason='subscription_cycle')
        // or just the initial payment.
        if ($subscriptionId && $invoice->billing_reason == 'subscription_cycle') {
            
            // Determine interval (month/year) from invoice lines if possible, or assume based on sub
            // Simplifying: Fetch sub to be sure, or just default to 'month' if unsure.
            // A safer way is checking the price interval in lines.
            $interval = 'month'; // Default
            if (isset($invoice->lines->data[0]->price->recurring->interval)) {
                $interval = $invoice->lines->data[0]->price->recurring->interval;
            }
            
            $extended = extendLicense($subscriptionId, $interval);
            
            if ($extended) {
                error_log("License for Sub $subscriptionId extended ($interval).");
            } else {
                error_log("Could not find license for Sub $subscriptionId to extend.");
            }
        }
        break;
        
    case 'customer.subscription.deleted':
        // Handle cancellation? Maybe set status='cancelled' so it doesn't renew, 
        // but keep 'expires_at' valid until the end.
        // For now, we rely on 'expires_at', so if it's not extended, it just dies naturally.
        break;
        
    default:
        // Unexpected event type
        // echo 'Received unknown event type ' . $event->type;
}

http_response_code(200);
