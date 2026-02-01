#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createAIChat } = require('./index');
const { exec } = require('child_process');

const PORT = 3000;
const clients = new Set();

// Create AI chat instance
const aiChat = createAIChat();

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    // Serve GUI
    const html = fs.readFileSync(path.join(__dirname, 'gui.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket implementation (manual, no dependencies)
server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  const acceptKey = generateAcceptKey(key);
  
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
  );
  
  clients.add(socket);
  console.log('Client connected. Total clients:', clients.size);
  
  // Send initial conversation list
  sendConversationList(socket);
  
  let buffer = Buffer.alloc(0);
  
  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    
    while (buffer.length > 0) {
      const frame = decodeFrame(buffer);
      if (!frame) break;
      
      buffer = buffer.slice(frame.length);
      
      if (frame.opcode === 0x8) {
        // Close frame
        socket.end();
        return;
      }
      
      if (frame.opcode === 0x1) {
        // Text frame
        handleMessage(socket, frame.payload.toString());
      }
    }
  });
  
  socket.on('close', () => {
    clients.delete(socket);
    console.log('Client disconnected. Total clients:', clients.size);
  });
  
  socket.on('error', (err) => {
    console.error('Socket error:', err);
    clients.delete(socket);
  });
});

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(socket, message) {
  try {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'chat':
        await handleChat(socket, data);
        break;
      
      case 'list':
        sendConversationList(socket);
        break;
      
      case 'load':
        loadConversation(socket, data.name);
        break;
      
      case 'openFolder':
        openConversationFolder();
        break;
      
      default:
        console.log('Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendMessage(socket, {
      type: 'error',
      message: error.message
    });
  }
}

/**
 * Handle chat message
 */
async function handleChat(socket, data) {
  const userMessage = data.message;
  
  try {
    // Stream response back to client
    await aiChat.chat(userMessage, {
      onStream: (chunk) => {
        sendMessage(socket, {
          type: 'stream',
          content: chunk
        });
      }
    });
    
    // Send completion message
    sendMessage(socket, {
      type: 'complete'
    });
    
    // Auto-save conversation
    const conversationName = data.conversationId || `chat_${Date.now()}`;
    aiChat.saveConversation(conversationName);
    
    // Update conversation list for all clients
    broadcastConversationList();
    
  } catch (error) {
    console.error('Chat error:', error);
    sendMessage(socket, {
      type: 'error',
      message: error.message
    });
  }
}

/**
 * Send conversation list to client
 */
function sendConversationList(socket) {
  const conversations = aiChat.listConversations();
  sendMessage(socket, {
    type: 'conversations',
    conversations: conversations
  });
}

/**
 * Broadcast conversation list to all clients
 */
function broadcastConversationList() {
  const conversations = aiChat.listConversations();
  const message = {
    type: 'conversations',
    conversations: conversations
  };
  
  clients.forEach(client => {
    sendMessage(client, message);
  });
}

/**
 * Load conversation
 */
function loadConversation(socket, name) {
  try {
    const conversation = aiChat.loadConversation(name);
    sendMessage(socket, {
      type: 'conversation',
      conversation: conversation
    });
  } catch (error) {
    sendMessage(socket, {
      type: 'error',
      message: error.message
    });
  }
}

/**
 * Open conversation folder in file explorer
 */
function openConversationFolder() {
  const dir = aiChat.getConversationDir();
  const platform = process.platform;
  
  let command;
  if (platform === 'win32') {
    command = `explorer "${dir}"`;
  } else if (platform === 'darwin') {
    command = `open "${dir}"`;
  } else {
    command = `xdg-open "${dir}"`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.error('Error opening folder:', error);
    }
  });
}

/**
 * Send message to WebSocket client
 */
function sendMessage(socket, data) {
  const message = JSON.stringify(data);
  const frame = encodeFrame(message);
  socket.write(frame);
}

/**
 * Generate WebSocket accept key
 */
function generateAcceptKey(key) {
  const crypto = require('crypto');
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const hash = crypto.createHash('sha1');
  hash.update(key + GUID);
  return hash.digest('base64');
}

/**
 * Encode WebSocket frame
 */
function encodeFrame(payload) {
  const payloadBuffer = Buffer.from(payload);
  const payloadLength = payloadBuffer.length;
  
  let frame;
  let offset = 0;
  
  if (payloadLength < 126) {
    frame = Buffer.alloc(2 + payloadLength);
    frame[1] = payloadLength;
    offset = 2;
  } else if (payloadLength < 65536) {
    frame = Buffer.alloc(4 + payloadLength);
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
    offset = 4;
  } else {
    frame = Buffer.alloc(10 + payloadLength);
    frame[1] = 127;
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLength, 6);
    offset = 10;
  }
  
  frame[0] = 0x81; // FIN + Text frame
  payloadBuffer.copy(frame, offset);
  
  return frame;
}

/**
 * Decode WebSocket frame
 */
function decodeFrame(buffer) {
  if (buffer.length < 2) return null;
  
  const opcode = buffer[0] & 0x0F;
  const masked = (buffer[1] & 0x80) === 0x80;
  let payloadLength = buffer[1] & 0x7F;
  let offset = 2;
  
  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = buffer.readUInt32BE(6);
    offset = 10;
  }
  
  if (masked) {
    if (buffer.length < offset + 4 + payloadLength) return null;
    
    const maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
    
    const payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[offset + i] ^ maskKey[i % 4];
    }
    
    return {
      opcode,
      payload,
      length: offset + payloadLength
    };
  } else {
    if (buffer.length < offset + payloadLength) return null;
    
    return {
      opcode,
      payload: buffer.slice(offset, offset + payloadLength),
      length: offset + payloadLength
    };
  }
}

// Start server
server.listen(PORT, () => {
  console.log('\n🤖 AI Chat Server Started!\n');
  console.log(`   Open in browser: http://localhost:${PORT}`);
  console.log(`   Conversations saved to: ${aiChat.getConversationDir()}`);
  console.log(`   Model: Llama 3.2B Instruct\n`);
  console.log('Press Ctrl+C to stop\n');
  
  // Auto-open browser
  const url = `http://localhost:${PORT}`;
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    command = `start ${url}`;
  } else if (platform === 'darwin') {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log('Please open browser manually to:', url);
    }
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});