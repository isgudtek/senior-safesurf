<?php
header('Content-Type: application/json');

// Get POST data
$rawData = file_get_contents('php://input');
$data = json_decode($rawData, true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'No data received']);
    exit;
}

$type = $data['type'] ?? 'General';
$email = $data['email'] ?? 'Not provided';
$message = $data['message'] ?? '';

if (empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Message is empty']);
    exit;
}

$to = "tazzcderq@gmail.com";
$subject = "[Senior SafeSurf Support] " . ucfirst($type);

$emailBody = "New Support Request Received:\n\n";
$emailBody .= "Type: " . strtoupper($type) . "\n";
$emailBody .= "From: " . $email . "\n";
$emailBody .= "Timestamp: " . date('Y-m-d H:i:s') . "\n\n";
$emailBody .= "Message:\n" . $message . "\n\n";
$emailBody .= "----------------------------------\n";
$emailBody .= "Sent via Senior SafeSurf Chrome Extension";

$headers = "From: support@gudtek.lol\r\n";
$headers .= "Reply-To: " . (empty($email) ? "tazzcderq@gmail.com" : $email) . "\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

if (mail($to, $subject, $emailBody, $headers)) {
    echo json_encode(['success' => true, 'message' => 'Message sent successfully!']);
} else {
    echo json_encode(['success' => false, 'message' => 'System error: mail function failed.']);
}