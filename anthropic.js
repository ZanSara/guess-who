// Anthropic API integration module
class AnthropicProvider {
    constructor() {
        this.name = 'anthropic';
        this.displayName = 'Anthropic';
        this.keyPrefix = 'sk-ant-';
        this.exampleModels = "claude-opus-4-1, claude-opus-4-0, claude-sonnet-4-0, claude-3-7-sonnet-latest"
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

    addToHistory(message) {
        // See createMultimodalMessage()
        this.conversationHistory.push(message);
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
            this.addToHistory({role: 'user', content: message});
        } else {
            // Handle multimodal message (object with content array)
            this.conversationHistory.push(message);
        }

        const params = {
            model: model,
            max_tokens: 4096,
            messages: [...this.conversationHistory], // Use internal history
            stream: false
        };

        // Add tools if provided - convert OpenAI format to Anthropic format
        if (tools && tools.length > 0) {
            params.tools = tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters
            }));
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

        // Extract response content and tool calls from Anthropic format
        if (data.content && data.content.length > 0) {
            for (const block of data.content) {
                if (block.type === 'text') {
                    accumulatedResponse += block.text;
                } else if (block.type === 'tool_use') {
                    hasToolCalls = true;
                    toolCalls.push({
                        id: block.id,
                        type: 'function',
                        function: {
                            name: block.name,
                            arguments: JSON.stringify(block.input)
                        }
                    });
                }
            }
            
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

        // Add assistant response to history
        this.addToHistory({role: 'assistant', content: accumulatedResponse});

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

    createMultimodalMessage(textContent, base64Images) {
        const content = [];
        if (textContent) {
            content.push({ type: 'text', text: textContent });
        }

        if (base64Images && Array.isArray(base64Images)) {
            base64Images.forEach(base64Image => {
                if (base64Image) {
                    content.push(this.createImageContent(base64Image));
                }
            });
        } else if (base64Images) { // Handle single image for backward compatibility
             content.push(this.createImageContent(base64Images));
        }
        
        return {
            role: 'user',
            content: content
        };
    }

}

// Export for use in main application
window.AnthropicProvider = AnthropicProvider;