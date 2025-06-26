<?php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
    exit;
}

$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

if ($username === 'admin' && $password === 'password') {
    $_SESSION['loggedin'] = true;
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
}
