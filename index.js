'use strict';

const { HfInference } = require('@huggingface/inference');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * AI Chat powered by Llama 3.2B with conversation history
 */
class AIChat {
  constructor(options = {}) {
    // Use environment variable or provided API key
    this.apiKey = options.apiKey || process.env.HF_TOKEN;
    
    if (!this.apiKey) {
      throw new Error('Hugging Face API token is required. Set HF_TOKEN environment variable or pass apiKey in options.');
    }
    
    this.model = options.model || 'meta-llama/Llama-3.2-3B-Instruct';
    this.conversationDir = options.conversationDir || this.getDefaultConversationDir();
    this.maxHistory = options.maxHistory || 10;
    
    this.hf = new HfInference(this.apiKey);
    this.conversation = [];
    
    this.ensureConversationDir();
  }

  /**
   * Get default conversation directory
   */
  getDefaultConversationDir() {
    if (process.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ai-chat', 'conversations');
    }
    return path.join(os.homedir(), '.ai-chat', 'conversations');
  }

  /**
   * Ensure conversation directory exists
   */
  ensureConversationDir() {
    if (!fs.existsSync(this.conversationDir)) {
      fs.mkdirSync(this.conversationDir, { recursive: true });
    }
  }

  /**
   * Send message and get AI response
   */
  async chat(userMessage, options = {}) {
    const streamCallback = options.onStream || null;
    
    // Add user message to conversation
    this.conversation.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });

    // Keep only recent history
    const recentConversation = this.conversation.slice(-this.maxHistory);

    // Format messages for Llama
    const messages = recentConversation.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    try {
      let fullResponse = '';

      if (streamCallback) {
        // Streaming response
        const stream = this.hf.chatCompletionStream({
          model: this.model,
          messages: messages,
          max_tokens: options.maxTokens || 500,
          temperature: options.temperature || 0.7
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            streamCallback(content);
          }
        }
      } else {
        // Non-streaming response
        const response = await this.hf.chatCompletion({
          model: this.model,
          messages: messages,
          max_tokens: options.maxTokens || 500,
          temperature: options.temperature || 0.7
        });

        fullResponse = response.choices[0]?.message?.content || 'No response';
      }

      // Add assistant response to conversation
      this.conversation.push({
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString()
      });

      return fullResponse;
    } catch (error) {
      throw new Error(`AI Chat Error: ${error.message}`);
    }
  }

  /**
   * Save conversation to file
   */
  saveConversation(name) {
    if (!name) {
      name = `conversation_${Date.now()}`;
    }

    const filename = `${name}.json`;
    const filepath = path.join(this.conversationDir, filename);

    const data = {
      name: name,
      created: this.conversation[0]?.timestamp || new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: this.conversation
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }

  /**
   * Load conversation from file
   */
  loadConversation(name) {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    const filepath = path.join(this.conversationDir, filename);

    if (!fs.existsSync(filepath)) {
      throw new Error(`Conversation not found: ${name}`);
    }

    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    this.conversation = data.messages || [];
    return data;
  }

  /**
   * List all saved conversations
   */
  listConversations() {
    if (!fs.existsSync(this.conversationDir)) {
      return [];
    }

    const files = fs.readdirSync(this.conversationDir)
      .filter(f => f.endsWith('.json'));

    return files.map(filename => {
      const filepath = path.join(this.conversationDir, filename);
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return {
        name: filename.replace('.json', ''),
        created: data.created,
        updated: data.updated,
        messageCount: data.messages.length
      };
    }).sort((a, b) => new Date(b.updated) - new Date(a.updated));
  }

  /**
   * Delete conversation
   */
  deleteConversation(name) {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    const filepath = path.join(this.conversationDir, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  }

  /**
   * Clear current conversation
   */
  clearConversation() {
    this.conversation = [];
  }

  /**
   * Get conversation history
   */
  getConversation() {
    return this.conversation;
  }

  /**
   * Get conversation directory path
   */
  getConversationDir() {
    return this.conversationDir;
  }
}

/**
 * Create AI chat instance
 */
function createAIChat(options) {
  return new AIChat(options);
}

module.exports = {
  AIChat,
  createAIChat
};