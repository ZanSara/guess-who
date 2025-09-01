// OpenRouter API integration module
class OpenRouterProvider {
    constructor() {
        this.name = 'openrouter';
        this.displayName = 'OpenRouter';
        this.keyPrefix = 'sk-or-';
        this.exampleModels = "openai/gpt-4o, anthropic/claude-3-5-sonnet, google/gemini-pro";
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
            
            console.log(`OpenRouter: Found ${data.data.length} total models`);
            
            // For now, let's be less restrictive and just use vision models
            // since tool support detection might not be working correctly
            const visionModels = data.data.filter(model => 
                model.architecture && 
                model.architecture.input_modalities && 
                model.architecture.input_modalities.includes('image')
            );
            
            console.log(`OpenRouter: Found ${visionModels.length} vision models`);
            
            // If no vision models found, use fallback list
            if (visionModels.length === 0) {
                console.log('OpenRouter: No vision models found, using fallback list');
                this.models = [
                    { value: 'openai/gpt-4o', name: 'GPT-4o' },
                    { value: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
                    { value: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
                    { value: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' }
                ];
            } else {
                // Map to our model format
                this.models = visionModels.map(model => ({
                    value: model.id,
                    name: model.name || model.id
                }));
                
                // Log first few models for debugging
                console.log('OpenRouter: First few vision models:', this.models.slice(0, 3));
            }

            // Set default model to the first available model
            if (this.models.length > 0) {
                this.defaultModel = this.models[0].value;
            }

            this.modelsLoaded = true;
            return this.models;

        } catch (error) {
            console.error('Error loading OpenRouter models:', error);
            // Fallback to known vision models
            this.models = [
                { value: 'openai/gpt-4o', name: 'GPT-4o' },
                { value: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
                { value: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
                { value: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
                { value: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' }
            ];
            this.defaultModel = 'openai/gpt-4o';
            this.modelsLoaded = true;
            console.log('OpenRouter: Using fallback models due to API error');
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
            
            // Filter for vision models (being less restrictive for now)
            const visionModels = data.data.filter(model => 
                model.architecture && 
                model.architecture.input_modalities && 
                model.architecture.input_modalities.includes('image')
            );

            // Use vision models or fallback
            if (visionModels.length === 0) {
                this.models = [
                    { value: 'openai/gpt-4o', name: 'GPT-4o' },
                    { value: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
                    { value: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
                    { value: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' }
                ];
            } else {
                // Map to our model format
                this.models = visionModels.map(model => ({
                    value: model.id,
                    name: model.name || model.id
                }));
            }

            // Set default model to the first available model
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

    addToHistory(message) {
        // See createMultimodalMessage()
        this.conversationHistory.push(message);
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
            this.addToHistory({role: 'user', content: message});
        } else {
            // Handle multimodal message (object with content array)
            this.conversationHistory.push(message);
        }

        const params = {
            model: model,
            messages: [...this.conversationHistory], // Use internal history
            stream: false
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
        // Parse the non-streaming response
        const data = await response.json();
        
        let accumulatedResponse = '';
        let hasToolCalls = false;
        let toolCalls = [];

        // Remove typing indicator
        if (typingIndicator && typingIndicator.parentNode) {
            typingIndicator.remove();
        }

        // Extract response content and tool calls from the complete response (OpenAI format)
        if (data.choices && data.choices[0]) {
            const choice = data.choices[0];
            const message = choice.message;
            
            if (message.content) {
                accumulatedResponse = message.content;
                
                // Create message element if not provided
                if (!messageElement) {
                    messageElement = document.createElement('div');
                    messageElement.className = 'message gpt-message';
                    messageElement.textContent = accumulatedResponse;
                    document.getElementById('chatMessages').appendChild(messageElement);
                    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                } else {
                    messageElement.textContent = accumulatedResponse;
                }
            }
            
            if (message.tool_calls && message.tool_calls.length > 0) {
                hasToolCalls = true;
                toolCalls = message.tool_calls;
            }
        }

        // Add assistant response to history
        this.addToHistory({role: 'assistant', content: accumulatedResponse});

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

    createMultimodalMessage(textContent, base64Image) {
        const content = [];
        if (textContent) {
            content.push({ type: 'text', text: textContent });
        }

        if (base64Image) { 
            content.push(this.createImageContent(base64Image));
        }
        
        return {
            role: 'user',
            content: content
        };
    }
}

// Export for use in main application
window.OpenRouterProvider = OpenRouterProvider;