// OpenRouter API integration module
class OpenRouterProvider {
    constructor() {
        this.name = 'openrouter';
        this.displayName = 'OpenRouter';
        this.keyPrefix = 'sk-or-';
        this.models = []; // Will be populated dynamically
        this.defaultModel = null; // Will be set after loading models
        this.conversationHistory = [];
        this.modelsLoaded = false;
    }

    async loadModels() {
        if (this.modelsLoaded && this.models.length > 0) {
            return this.models;
        }

        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('OpenRouter API key is required to load models');
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            
            // Filter models that support images (vision models)
            const visionModels = data.data.filter(model => 
                model.architecture && 
                model.architecture.input_modalities && 
                model.architecture.input_modalities.includes('image')
            );

            // Map to our model format
            this.models = visionModels.map(model => ({
                value: model.id,
                name: model.name || model.id
            }));

            // Set default model to the first available vision model
            if (this.models.length > 0) {
                this.defaultModel = this.models[0].value;
            }

            this.modelsLoaded = true;
            return this.models;

        } catch (error) {
            console.error('Error loading OpenRouter models:', error);
            // Fallback to a known vision model
            this.models = [
                { value: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
                { value: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
                { value: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
                { value: 'openai/gpt-4o', name: 'GPT-4o' },
                { value: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' }
            ];
            this.defaultModel = 'openai/gpt-4o';
            this.modelsLoaded = true;
            throw error;
        }
    }

    async validateApiKey(key) {
        // Temporarily set the key for validation
        const tempKey = key || this.getApiKey();
        if (!tempKey) {
            throw new Error('API key is required');
        }

        try {
            // Test by making a simple models request and load models at the same time
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tempKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your OpenRouter API key and try again.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Your API key is valid but you\'ve hit the rate limit.');
            } else if (response.status === 403) {
                throw new Error('API key does not have access to the required resources.');
            } else if (!response.ok) {
                throw new Error(`API validation failed (${response.status}). Please try again.`);
            }

            // Key is valid, now parse the models for future use
            const data = await response.json();
            
            // Filter models that support images (vision models)
            const visionModels = data.data.filter(model => 
                model.architecture && 
                model.architecture.input_modalities && 
                model.architecture.input_modalities.includes('image')
            );

            // Map to our model format
            this.models = visionModels.map(model => ({
                value: model.id,
                name: model.name || model.id
            }));

            // Set default model to the first available vision model
            if (this.models.length > 0) {
                this.defaultModel = this.models[0].value;
            }

            this.modelsLoaded = true;
            return true;

        } catch (error) {
            // Reset models on validation failure
            this.models = [];
            this.defaultModel = null;
            this.modelsLoaded = false;
            throw error;
        }
    }

    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    setSystemPrompt(systemPrompt) {
        // For OpenRouter, system prompt goes at the beginning of conversation
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

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getApiKey()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Guess Who Game'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your OpenRouter API key.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            } else if (response.status === 402) {
                throw new Error('Insufficient credits. Please check your OpenRouter account balance.');
            } else {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error?.message || `API request failed: ${response.status}`;
                throw new Error(errorMessage);
            }
        }

        return response;
    }

    async streamResponse(response, messageElement, typingIndicator = null) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedResponse = '';
        let hasToolCalls = false;
        let toolCalls = [];
        let currentToolCalls = {};
        let typingIndicatorRemoved = false;

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
                                    // Remove typing indicator and create message element on first content
                                    if (!typingIndicatorRemoved && typingIndicator && typingIndicator.parentNode) {
                                        typingIndicator.remove();
                                        typingIndicatorRemoved = true;
                                        
                                        // Create message element if not provided
                                        if (!messageElement) {
                                            messageElement = document.createElement('div');
                                            messageElement.className = 'message gpt-message';
                                            messageElement.textContent = '';
                                            document.getElementById('chatMessages').appendChild(messageElement);
                                            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                                        }
                                    }
                                    accumulatedResponse += delta.content;
                                    if (messageElement) {
                                        messageElement.textContent = accumulatedResponse;
                                    }
                                }
                                if (delta.tool_calls) {
                                    hasToolCalls = true;
                                    // Process tool calls streaming (same as OpenAI format)
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
            // Remove typing indicator if it's still there and create empty message element if needed
            if (!typingIndicatorRemoved && typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
                // Create message element if not created yet
                if (!messageElement) {
                    messageElement = document.createElement('div');
                    messageElement.className = 'message gpt-message';
                    messageElement.textContent = accumulatedResponse || '';
                    document.getElementById('chatMessages').appendChild(messageElement);
                    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                }
            }
        }

        // Convert accumulated tool calls to array
        toolCalls = Object.values(currentToolCalls);

        // Add assistant response to history
        this.addToHistory('assistant', accumulatedResponse);

        return { response: accumulatedResponse, hasToolCalls, toolCalls };
    }

    getApiKey() {
        return localStorage.getItem('openrouter-api-key');
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
window.OpenRouterProvider = OpenRouterProvider;