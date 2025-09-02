// OpenAI API integration module
class OpenAIProvider {
    constructor() {
        this.name = 'openai';
        this.displayName = 'OpenAI';
        this.keyPrefix = 'sk-';
        this.exampleModels = "gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o";
        this.defaultModel = 'gpt-4o';
        this.defaultEndpoint = 'https://api.openai.com/v1';  // https://openrouter.ai/api/v1/models
        this.conversationHistory = [];
    }

    async validateApiKey(key, model) {
        const params = {
            model: model,
            messages: [{ role: 'user', content: 'test' }],
            stream: false
        };

        const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
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

    addToHistory(message) {
        // See createMultimodalMessage()
        this.conversationHistory.push(message);
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
            this.addToHistory({role: 'user', content: message});
        } else {
            // Handle multimodal message (object with content array)
            this.conversationHistory.push(message);
        }
        console.log(this.conversationHistory);

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

        const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
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
                let errorMessage = ''
                try {
                    const errorData = await response.json();
                    errorMessage = `${JSON.stringify(errorData)}`;
                } catch (jsonError) {
                    // If JSON parsing fails, just use the status code
                    errorMessage = '(no JSON error details)';
                }
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

        // Remove typing indicator and create message element
        if (typingIndicator && typingIndicator.parentNode) {
            typingIndicator.remove();
        }

        // Extract response content and tool calls from the complete response
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
        return localStorage.getItem('openai-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    getEndpoint() {
        return localStorage.getItem('openai-endpoint') || this.defaultEndpoint;
    }

    setEndpoint(endpoint) {
        localStorage.setItem('openai-endpoint', endpoint);
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
window.OpenAIProvider = OpenAIProvider;