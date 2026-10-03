#!/usr/bin/env node
// NEOCHAT Test Server Script
// This script tests the basic functionality of the NEOCHAT server

const { spawn } = require('child_process');
const path = require('path');

console.log('[NEOCHAT TEST] Starting NEOCHAT server...');

// Start the server
const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT: 3001 }
});

// Wait for server to be ready
let attempts = 0;
const maxAttempts = 30;

function checkServer() {
    const net = require('net');
    
    const client = new net.Socket();
    client.setTimeout(1000);
    
    client.connect(3001, '127.0.0.1', () => {
        client.destroy();
        console.log('[NEOCHAT TEST] ✅ Server is running on port 3001');
        console.log('[NEOCHAT TEST] Access the chat at http://localhost:3001');
        console.log('[NEOCHAT TEST] Basic functionality test passed');
        process.exit(0);
    });
    
    client.on('error', (error) => {
        attempts++;
        if (attempts >= maxAttempts) {
            console.error('[NEOCHAT TEST] ❌ Server failed to start within timeout');
            process.exit(1);
        } else {
            console.log('[NEOCHAT TEST] Waiting for server... (attempt', attempts, '/', maxAttempts, ')');
            setTimeout(checkServer, 1000);
        }
    });
}

// Handle server process exit
serverProcess.on('exit', (code) => {
    if (code !== 0) {
        console.error('[NEOCHAT TEST] ❌ Server process exited with code:', code);
        process.exit(code);
    }
});

// Handle server process errors
serverProcess.on('error', (error) => {
    console.error('[NEOCHAT TEST] Server error:', error);
});

serverProcess.stderr.on('data', (data) => {
    console.error('[NEOCHAT TEST] Server stderr:', data.toString());
});

// Start checking server status after 2 seconds
setTimeout(checkServer, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[NEOCHAT TEST] Shutting down server...');
    serverProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[NEOCHAT TEST] Shutting down server...');
    serverProcess.kill('SIGTERM');
    process.exit(0);
});

// Output test instructions
console.log('\n' + '='.repeat(60));
console.log('NEOCHAT Basic Functionality Test');
console.log('='.repeat(60));
console.log('1. Server started on http://localhost:3001');
console.log('2. Open your browser and navigate to the above URL');
console.log('3. You should see the NEOCHAT cyberpunk interface');
console.log('4. Test: Enter a nickname and channel ID to connect');
console.log('5. Send a test message to verify real-time communication');
console.log('6. Press CTRL+C to stop the server');
console.log('='.repeat(60));
console.log('If the server starts successfully, the test will complete automatically.');
console.log('');
