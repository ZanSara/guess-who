// OpenAI API integration module
class OpenAIProvider {
    constructor() {
        this.name = 'openai';
        this.displayName = 'OpenAI';
        this.keyPrefix = 'sk-';
        this.models = [
            { value: 'gpt-4o', name: 'GPT-4o' },
            { value: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { value: 'gpt-5', name: 'GPT-5' },
            { value: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { value: 'gpt-4', name: 'GPT-4' },
            { value: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ];
        this.defaultModel = 'gpt-4o';
        this.description = 'GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-4o';
    }

    async validateApiKey(key, model) {
        const params = {
            model: model,
            messages: [{ role: 'user', content: 'test' }],
            stream: false
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (response.status === 401) {
            throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Your API key is valid but you\'ve hit the rate limit.');
        } else if (response.status === 403) {
            throw new Error('API key does not have access to the required model.');
        } else if (!response.ok) {
            throw new Error(`API validation failed (${response.status}). Please try again.`);
        }
    }

    async callAPI(message, model, conversationHistory = []) {
        const messages = [];
        
        // Add conversation history
        messages.push(...conversationHistory);
        
        // Add current message
        messages.push({
            role: 'user',
            content: message
        });

        const params = {
            model: model,
            messages: messages,
            stream: true
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getApiKey()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your OpenAI API key.');
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
                            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                                const delta = parsed.choices[0].delta;
                                if (delta.content) {
                                    accumulatedResponse += delta.content;
                                    messageElement.textContent = accumulatedResponse;
                                }
                                if (delta.tool_calls) {
                                    hasToolCalls = true;
                                }
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
        return localStorage.getItem('openai-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    formatHistoryMessage(role, content) {
        return { role, content };
    }
}

// Export for use in main application
window.OpenAIProvider = OpenAIProvider;