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
        this.conversationHistory = [];
        this.systemPrompt = '';
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

    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
    }

    clearHistory() {
        this.conversationHistory = [];
        this.systemPrompt = '';
    }

    setSystemPrompt(systemPrompt) {
        // For Anthropic, system prompt is separate from conversation history
        this.systemPrompt = systemPrompt;
        this.conversationHistory = []; // Clear history when setting system prompt
    }

    async callAPI(message, model, tools = null) {
        // Add user message to history - handle both string and multimodal content
        if (typeof message === 'string') {
            this.addToHistory('user', message);
        } else {
            // Handle multimodal message (object with content array)
            this.conversationHistory.push(message);
        }

        const params = {
            model: model,
            max_tokens: 4096,
            messages: [...this.conversationHistory], // Use internal history
            stream: true
        };

        // Add tools if provided
        if (tools && tools.length > 0) {
            params.tools = tools;
        }

        // Add system prompt as separate parameter for Anthropic
        if (this.systemPrompt) {
            params.system = this.systemPrompt;
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
        let toolCalls = [];
        let currentToolCall = null;

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
                                currentToolCall = {
                                    id: parsed.content_block.id,
                                    type: 'function',
                                    function: {
                                        name: parsed.content_block.name,
                                        arguments: ''
                                    }
                                };
                            }
                            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.partial_json && currentToolCall) {
                                currentToolCall.function.arguments += parsed.delta.partial_json;
                            }
                            if (parsed.type === 'content_block_stop' && currentToolCall) {
                                toolCalls.push(currentToolCall);
                                currentToolCall = null;
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

        // Add assistant response to history
        this.addToHistory('assistant', accumulatedResponse);

        return { response: accumulatedResponse, hasToolCalls, toolCalls };
    }

    getApiKey() {
        return localStorage.getItem('anthropic-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    createImageContent(base64Image) {
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image
            }
        };
    }

}

// Export for use in main application
window.AnthropicProvider = AnthropicProvider;