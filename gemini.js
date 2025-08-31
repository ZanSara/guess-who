// Gemini API integration module
class GeminiProvider {
    constructor() {
        this.name = 'gemini';
        this.displayName = 'Google Gemini';
        this.keyPrefix = 'AIza';
        this.models = [
            { value: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' }
        ];
        this.defaultModel = 'gemini-2.5-flash';
        this.conversationHistory = [];
        this.systemPrompt = '';
    }

    async validateApiKey(key) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
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

    addToHistory(role, content) {
        // Convert standard roles to Gemini format
        const geminiRole = role === 'assistant' ? 'model' : role;
        this.conversationHistory.push({
            role: geminiRole,
            parts: [{ text: content }]
        });
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
            this.addToHistory('user', message);
        } else if (message.parts) {
            // Handle Gemini-style multimodal message (object with parts array)
            const geminiMessage = {
                role: 'user',
                parts: message.parts
            };
            this.conversationHistory.push(geminiMessage);
        } else {
            // Handle other multimodal formats and convert to Gemini format
            this.conversationHistory.push({
                role: 'user',
                parts: message.content ? message.content.map(item => {
                    if (item.type === 'text') return { text: item.text };
                    if (item.type === 'image') return item.source ? { inlineData: { mimeType: item.source.media_type, data: item.source.data } } : item;
                    return item;
                }) : [{ text: JSON.stringify(message) }]
            });
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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.getApiKey()}`, {
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
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedResponse = '';
        let hasToolCalls = false;
        let toolCalls = [];
        let buffer = '';
        let bracketCount = 0;
        let inJsonObject = false;
        let currentJsonObject = '';
        let typingIndicatorRemoved = false;

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Process character by character to properly handle JSON objects
                for (let i = 0; i < buffer.length; i++) {
                    const char = buffer[i];
                    
                    if (char === '{') {
                        if (!inJsonObject) {
                            inJsonObject = true;
                            currentJsonObject = '';
                            bracketCount = 0;
                        }
                        bracketCount++;
                        currentJsonObject += char;
                    } else if (char === '}') {
                        if (inJsonObject) {
                            bracketCount--;
                            currentJsonObject += char;
                            
                            // Complete JSON object found
                            if (bracketCount === 0) {
                                try {
                                    const parsed = JSON.parse(currentJsonObject);
                                    
                                    // Extract text from Gemini response format
                                    if (parsed.candidates && parsed.candidates.length > 0) {
                                        const candidate = parsed.candidates[0];
                                        if (candidate.content && candidate.content.parts) {
                                            for (const part of candidate.content.parts) {
                                                if (part.text) {
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
                                                    accumulatedResponse += part.text;
                                                    if (messageElement) {
                                                        messageElement.textContent = accumulatedResponse;
                                                    }
                                                }
                                                if (part.functionCall) {
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
                                        }
                                    }
                                } catch (e) {
                                    // Skip invalid JSON objects
                                    console.warn('Failed to parse Gemini JSON object:', currentJsonObject.substring(0, 100) + '...', e);
                                }
                                
                                inJsonObject = false;
                                currentJsonObject = '';
                            }
                        }
                    } else if (inJsonObject) {
                        currentJsonObject += char;
                    }
                    // Skip characters outside JSON objects (like array brackets, commas, whitespace)
                }

                // Keep only the unprocessed part of the buffer
                buffer = '';
                if (inJsonObject) {
                    // If we're in the middle of a JSON object, keep the current object in buffer
                    buffer = currentJsonObject;
                    currentJsonObject = '';
                    inJsonObject = false;
                    bracketCount = 0;
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

        // Add assistant response to history
        this.addToHistory('assistant', accumulatedResponse);

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