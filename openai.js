// OpenAI API integration module
class OpenAIProvider {
    constructor() {
        this.name = 'openai';
        this.displayName = 'OpenAI';
        this.keyPrefix = 'sk-';
        this.models = [
            { value: 'gpt-5', name: 'GPT-5' },
            { value: 'gpt-5-mini', name: 'GPT-5 Mini' },
            { value: 'gpt-5-nano', name: 'GPT-5 Nano' },
            { value: 'gpt-4o', name: 'GPT-4o' },
            { value: 'gpt-4o-mini', name: 'GPT-4o Mini' }
        ];
        this.defaultModel = 'gpt-4o';
        this.conversationHistory = [];
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

    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    setSystemPrompt(systemPrompt) {
        // For OpenAI, system prompt goes at the beginning of conversation
        this.clearHistory();
        this.conversationHistory.push({ role: 'system', content: systemPrompt });
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
            messages: [...this.conversationHistory], // Use internal history
            stream: true
        };

        // Add tools if provided
        if (tools && tools.length > 0) {
            params.tools = tools.map(tool => ({
                type: 'function',
                function: tool
            }));
        }

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
        let toolCalls = [];
        let currentToolCalls = {};

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
                                    // Process tool calls streaming
                                    for (const toolCall of delta.tool_calls) {
                                        const id = toolCall.id;
                                        if (!currentToolCalls[id]) {
                                            currentToolCalls[id] = {
                                                id: id,
                                                type: toolCall.type || 'function',
                                                function: {
                                                    name: toolCall.function?.name || '',
                                                    arguments: toolCall.function?.arguments || ''
                                                }
                                            };
                                        } else {
                                            // Append to existing tool call
                                            if (toolCall.function?.name) {
                                                currentToolCalls[id].function.name += toolCall.function.name;
                                            }
                                            if (toolCall.function?.arguments) {
                                                currentToolCalls[id].function.arguments += toolCall.function.arguments;
                                            }
                                        }
                                    }
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

        // Convert accumulated tool calls to array
        toolCalls = Object.values(currentToolCalls);

        // Add assistant response to history
        this.addToHistory('assistant', accumulatedResponse);

        return { response: accumulatedResponse, hasToolCalls, toolCalls };
    }

    getApiKey() {
        return localStorage.getItem('openai-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    createImageContent(base64Image) {
        return {
            type: 'image_url',
            image_url: {
                url: `data:image/png;base64,${base64Image}`
            }
        };
    }

}

// Export for use in main application
window.OpenAIProvider = OpenAIProvider;