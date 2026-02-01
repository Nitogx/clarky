#!/usr/bin/env node
'use strict';

/**
 * AI Chat CLI Launcher
 * Usage: ai-chat [options]
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

// Check for help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AI Chat - Llama 3.2B Chat Interface

Usage:
  ai-chat                Start GUI server
  ai-chat --help         Show this help
  ai-chat --version      Show version

The GUI will automatically open in your browser at http://localhost:3000

Features:
  • Real-time AI chat powered by Llama 3.2B Instruct
  • Automatic conversation saving
  • Beautiful web interface
  • Streaming responses
  • Conversation history management
`);
  process.exit(0);
}

// Check for version
if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('./package.json');
  console.log(`ai-chat v${pkg.version}`);
  process.exit(0);
}

// Start server
console.log('Starting AI Chat server...\n');

const serverPath = path.join(__dirname, 'server.js');
const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  shell: false
});

child.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(code);
  }
});

// Forward signals
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});