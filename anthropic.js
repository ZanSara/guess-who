// Anthropic API integration module
class AnthropicProvider {
    constructor() {
        this.name = 'anthropic';
        this.displayName = 'Anthropic';
        this.keyPrefix = 'sk-ant-';
        this.models = [
            { value: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
            { value: 'claude-opus-4-0', name: 'Claude Opus 4.0' },
            { value: 'claude-sonnet-4-0', name: 'Claude Sonnet 4.0' },
            { value: 'claude-3-7-sonnet-latest', name: 'Claude Sonnet 3.7' },
        ];
        this.defaultModel = 'claude-sonnet-4-0';
        this.description = 'Claude Opus 4, Claude Sonnet 4';
    }

    async validateApiKey(key, model) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }]
            })
        });

        if (response.status === 401) {
            throw new Error('Invalid API key. Please check your Anthropic API key and try again.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Your API key is valid but you\'ve hit the rate limit.');
        } else if (response.status === 403) {
            throw new Error('API key does not have access to the required model.');
        } else if (response.status === 400) {
            // Check if it's a bad request due to invalid model or key format
            const errorData = await response.json().catch(() => null);
            if (errorData && errorData.error && errorData.error.message) {
                if (errorData.error.message.includes('model') || errorData.error.message.includes('Model')) {
                    throw new Error('Selected model is not available with this API key.');
                } else {
                    throw new Error(`API key validation failed: ${errorData.error.message}`);
                }
            } else {
                throw new Error('Invalid API key format or request. Please check your Anthropic API key.');
            }
        } else if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.error?.message || `API validation failed (${response.status}). Please try again.`;
            throw new Error(errorMessage);
        }
    }

    async callAPI(message, model, conversationHistory = []) {
        const messages = [];
        let systemPrompt = null;
        
        // Extract system prompt if it's the first message in conversation history
        const conversationToProcess = [...conversationHistory];
        if (conversationToProcess.length > 0 && conversationToProcess[0].role === 'system') {
            systemPrompt = conversationToProcess.shift().content;
        }
        
        // Add conversation history (without system message)
        messages.push(...conversationToProcess);
        
        // Add current message
        messages.push({
            role: 'user',
            content: message
        });

        const params = {
            model: model,
            max_tokens: 4096,
            messages: messages,
            stream: true
        };

        // Add system prompt as separate parameter for Anthropic
        if (systemPrompt) {
            params.system = systemPrompt;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': this.getApiKey(),
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your Anthropic API key.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            } else {
                throw new Error(`API request failed: ${response.status}`);
            }
        }

        return response;
    }

    async streamResponse(response, messageElement) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedResponse = '';
        let hasToolCalls = false;

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                                accumulatedResponse += parsed.delta.text;
                                messageElement.textContent = accumulatedResponse;
                            }
                            if (parsed.type === 'content_block_start' && parsed.content_block && parsed.content_block.type === 'tool_use') {
                                hasToolCalls = true;
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return { response: accumulatedResponse, hasToolCalls };
    }

    getApiKey() {
        return localStorage.getItem('anthropic-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    formatHistoryMessage(role, content) {
        return { role, content };
    }
}

// Export for use in main application
window.AnthropicProvider = AnthropicProvider;