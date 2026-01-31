# Clarky -- AI for Soso PPM
**Happy 2 years clarky!**

## Install
### Soso
```console
soso install @clark-ai/ai-chat
```

# How To Use?
**Example code:**
```javascript
const { createAIChat } = require('@clark-ai/ai-chat');

async function main() {
  // Create AI chat instance
  const chat = createAIChat({
    apiKey: 'your-huggingface-token-here'
  });

  // Send a message
  const response = await chat.chat('Hello! How are you?');
  console.log('AI:', response);
}

main().catch(console.error);
```
