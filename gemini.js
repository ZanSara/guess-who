// Gemini API integration module
class GeminiProvider {
    constructor() {
        this.name = 'gemini';
        this.displayName = 'Google Gemini';
        this.keyPrefix = 'AIza';
        this.exampleModels = "gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite"
        this.defaultModel = 'gemini-2.5-flash';
        this.conversationHistory = [];
        this.systemPrompt = '';
    }

    async validateApiKey(key, model) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({"contents": {
                role: 'user',
                parts: [{ text: 'test' }]
            }})
        });

        if (response.status === 400) {
            throw new Error('Invalid API key. Please check your Google API key and try again.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Your API key is valid but you\'ve hit the rate limit.');
        } else if (response.status === 403) {
            throw new Error('API key does not have access to the required model.');
        } else if (!response.ok) {
            const error = await response.json();
            throw new Error(error?.error?.message || `API validation failed (${response.status}). Please try again.`);
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
        // For Gemini, system prompt is separate as systemInstruction
        this.systemPrompt = systemPrompt;
        this.conversationHistory = []; // Clear history when setting system prompt
    }

    async callAPI(message, model, tools = null) {
        // Add user message to history - handle both string and multimodal content
        if (typeof message === 'string') {
            this.addToHistory({
                role: 'user',
                parts: [{ text: message }]
            });
        } else {
            // Handle multimodal message (object with parts array from createMultimodalMessage)
            this.conversationHistory.push(message);
        }

        const params = {
            contents: [...this.conversationHistory], // Use internal history
            generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.7
            }
        };

        // Add tools if provided
        if (tools && tools.length > 0) {
            params.tools = [{
                functionDeclarations: tools
            }];
        }

        // Add system instruction as separate parameter for Gemini
        if (this.systemPrompt) {
            params.systemInstruction = {
                parts: [{ text: this.systemPrompt }]
            };
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.getApiKey()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            if (response.status === 400) {
                throw new Error('Invalid API key. Please check your Google API key.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            } else {
                const error = await response.json();
                throw new Error(error?.error?.message || `API request failed: ${response.status}`);
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

        // Extract response content and tool calls from Gemini format
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.text) {
                        accumulatedResponse += part.text;
                    } else if (part.functionCall) {
                        hasToolCalls = true;
                        // Convert Gemini format to standard format
                        toolCalls.push({
                            id: `gemini_${Date.now()}_${toolCalls.length}`,
                            type: 'function',
                            function: {
                                name: part.functionCall.name,
                                arguments: JSON.stringify(part.functionCall.args || {})
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
        }

        // Add assistant response to history
        this.addToHistory({
            role: 'model',
            parts: [{ text: accumulatedResponse }]
        });

        return { response: accumulatedResponse, hasToolCalls, toolCalls };
    }

    getApiKey() {
        return localStorage.getItem('gemini-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    createImageContent(base64Image) {
        return {
            inlineData: {
                mimeType: 'image/png',
                data: base64Image
            }
        };
    }

    createMultimodalMessage(textContent, base64Images) {
        const parts = [];
        if (textContent) {
            parts.push({ text: textContent });
        }

        if (base64Images && Array.isArray(base64Images)) {
            base64Images.forEach(base64Image => {
                if (base64Image) {
                    parts.push(this.createImageContent(base64Image));
                }
            });
        } else if (base64Images) { // Handle single image for backward compatibility
             parts.push(this.createImageContent(base64Images));
        }
        
        return {
            role: 'user',
            parts: parts
        };
    }

}

// Export for use in main application
window.GeminiProvider = GeminiProvider;