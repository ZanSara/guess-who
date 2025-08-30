// Gemini API integration module
class GeminiProvider {
    constructor() {
        this.name = 'gemini';
        this.displayName = 'Google Gemini';
        this.keyPrefix = 'AIza';
        this.models = [
            { value: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
            { value: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { value: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
        ];
        this.defaultModel = 'gemini-2.5-pro';
        this.description = 'Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash Lite';
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
            throw new Error(error.error.message || `API validation failed (${response.status}). Please try again.`);
        }
    }

    async callAPI(message, model, conversationHistory = []) {
        const contents = [];
        let systemInstruction = null;
        
        // Extract system prompt if it's the first message in conversation history
        const conversationToProcess = [...conversationHistory];
        if (conversationToProcess.length > 0 && conversationToProcess[0].role === 'system') {
            systemInstruction = {
                parts: [{ text: conversationToProcess.shift().content }]
            };
        }
        
        // Add conversation history (without system message)
        contents.push(...conversationToProcess);
        
        // Add current message
        contents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        const params = {
            contents: contents,
            generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.7
            }
        };

        // Add system instruction as separate parameter for Gemini
        if (systemInstruction) {
            params.systemInstruction = systemInstruction;
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
                throw new Error(error.error.message || `API request failed: ${response.status}`);
            }
        }

        return response;
    }

    async streamResponse(response, messageElement) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedResponse = '';
        let hasToolCalls = false;
        let buffer = '';
        let bracketCount = 0;
        let inJsonObject = false;
        let currentJsonObject = '';

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
                                                    accumulatedResponse += part.text;
                                                    messageElement.textContent = accumulatedResponse;
                                                }
                                                if (part.functionCall) {
                                                    hasToolCalls = true;
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
        }

        return { response: accumulatedResponse, hasToolCalls };
    }

    getApiKey() {
        return localStorage.getItem('gemini-api-key');
    }

    getCurrentModel() {
        return localStorage.getItem('ai-model') || this.defaultModel;
    }

    formatHistoryMessage(role, content) {
        // Convert standard roles to Gemini format
        const geminiRole = role === 'assistant' ? 'model' : role;
        return {
            role: geminiRole,
            parts: [{ text: content }]
        };
    }
}

// Export for use in main application
window.GeminiProvider = GeminiProvider;