
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./ui.css"; // We'll create this next

function App() {
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState("gemini-1.5-flash");
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [promptContext, setPromptContext] = useState("");
    const [status, setStatus] = useState("Idle");
    const [selectionStats, setSelectionStats] = useState({ count: 0, estimatedTokens: 0 });
    const [lastUsage, setLastUsage] = useState<{ promptTokens: number, completionTokens: number, totalTokens: number } | null>(null);

    useEffect(() => {
        // Request initial data like stored API key
        parent.postMessage({ pluginMessage: { type: "request-storage" } }, "*");

        window.onmessage = (event) => {
            const { type, payload } = event.data.pluginMessage;
            if (type === "loaded-storage") {
                if (payload.apiKey) {
                    setApiKey(payload.apiKey);
                    // Fetch models 
                    fetchModels(payload.apiKey);
                }
            } else if (type === "selection-changed") {
                setSelectionStats(payload);
            } else if (type === "layers-renamed") {
                setStatus("Layers renamed successfully!");
                setTimeout(() => setStatus("Idle"), 3000);
            } else if (type === "layers-data-for-ai") {
                // payload: { layers, context, apiKey, model }
                const { layers, context, apiKey, model } = payload;
                console.log("Sending to AI...", { model, layersCount: layers.length });
                setStatus(`Using ${model}...`);
                (async () => { // Wrap async call in an IIFE
                    try {
                        const startTime = Date.now();
                        const result = await callLLM(apiKey, model, context, layers);

                        // Set usage if available
                        if (result.usage) {
                            setLastUsage(result.usage);
                        }

                        console.log("Received response from AI in", (Date.now() - startTime) + "ms", result.renames);
                        // Send renames back to plugin code
                        parent.postMessage({ pluginMessage: { type: "apply-renames", renames: result.renames } }, "*");
                    } catch (error) {
                        console.error(error);
                        setStatus("Error: " + (error instanceof Error ? error.message : String(error)));
                    }
                })();
            } else if (type === "error") {
                setStatus(`Error: ${payload} `);
            }
        };
    }, []);

    // Simple Gemini API call with Retry Logic
    const callLLM = async (apiKey: string, model: string, context: string, layers: any[]) => {
        const prompt = `
            You are a helper for Figma. Rename the following layers AND all their children recursively to be descriptive and professional based on their content/context.
            Context: ${context || "None provided"}
            
            Hierarchy to rename (JSON):
            ${JSON.stringify(layers, null, 2)}
            
            Return ONLY a valid JSON object mapping original layer IDs to new names for ALL renamed nodes.
            Example: { "1:2": "Submit Button", "1:3": "Button Label", "1:4": "Icon" }
            Do not include markdown formatting or backticks.
        `;

        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });

                if (!response.ok) {
                    // specific handling for 503 Overloaded
                    if (response.status === 503) {
                        attempt++;
                        if (attempt < maxRetries) {
                            console.warn(`Model overloaded (503). Retrying attempt ${attempt}/${maxRetries}...`);
                            setStatus(`Model overloaded. Retrying (${attempt}/${maxRetries})...`);
                            // Wait 2 seconds before retrying
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            continue;
                        }
                    }

                    if (response.status === 429) {
                        throw new Error("Quota exceeded (Rate Limit). Please wait ~30 seconds and try again.");
                    }

                    let errorMsg = response.statusText;
                    try {
                        const errorBody = await response.json();
                        errorMsg = errorBody.error?.message || JSON.stringify(errorBody);
                    } catch (e) {
                        // ignore json parse error
                    }
                    throw new Error(`API Error ${response.status}: ${errorMsg}`);
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error("No response text from AI");

                // Clean up potential markdown code blocks
                const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

                return {
                    renames: JSON.parse(cleanText),
                    usage: data.usageMetadata ? {
                        promptTokens: data.usageMetadata.promptTokenCount,
                        completionTokens: data.usageMetadata.candidatesTokenCount,
                        totalTokens: data.usageMetadata.totalTokenCount
                    } : null
                };
            } catch (error: any) {
                // If it's not a fetch error (like network issue) but a throw from above, rethrow
                if (error.message.includes("API Error") || error.message.includes("Quota exceeded")) {
                    throw error;
                }
                // Network errors might also be worth retrying, but for now let's stick to 503 logic above
                throw error;
            }
        }
        throw new Error("Service Unavailable (503) after multiple retries.");
    };

    const fetchModels = async (key: string) => {
        if (!key) return;
        setStatus("Fetching models...");

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!response.ok) throw new Error("Failed to list Google models");
            const data = await response.json();
            const models = data.models
                .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
                .map((m: any) => ({
                    name: m.name.replace("models/", ""),
                    displayName: m.displayName
                }));

            setAvailableModels(models);
            if (models.length > 0) setModel(models[0].name);
            setStatus("Models loaded. Ready to rename.");
        } catch (e) {
            console.error(e);
            setStatus("Could not load models. Using default list.");
        }
    };

    const handleRename = async () => {
        if (!apiKey) {
            setStatus("Please enter an API Key.");
            return;
        }
        setStatus("Processing...");
        // Tell plugin code to get selection data
        parent.postMessage(
            { pluginMessage: { type: "rename-layers", apiKey, model, context: promptContext } },
            "*"
        );
    };

    const saveKey = (key: string) => {
        setApiKey(key);
        parent.postMessage({ pluginMessage: { type: "save-api-key", apiKey: key } }, "*");
    };

    return (
        <div className="container">
            <h2>AI Layer Renamer</h2>

            {/* Stats Display */}
            <div className="stats-box" style={{ background: '#f5f5f5', padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '11px', color: '#555' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Selected: <strong>{selectionStats.count}</strong> layers</span>
                    <span>Est. Tokens: <strong>~{selectionStats.estimatedTokens}</strong></span>
                </div>
                {lastUsage && (
                    <div style={{ marginTop: '4px', borderTop: '1px solid #ddd', paddingTop: '4px', color: '#666' }}>
                        Last Request: <strong>{lastUsage.totalTokens}</strong> tokens (In: {lastUsage.promptTokens}, Out: {lastUsage.completionTokens})
                    </div>
                )}
            </div>

            <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>API Key (Google Gemini)</label>
                    <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: '#007aff', textDecoration: 'none' }}
                    >
                        Get Gemini Key
                    </a>
                </div>
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                        saveKey(e.target.value);
                    }}
                    onBlur={() => fetchModels(apiKey)}
                    placeholder="Enter Gemini API Key"
                />
                <button className="secondary" onClick={() => fetchModels(apiKey)} style={{ marginTop: '4px', fontSize: '11px', padding: '4px' }}>
                    Check Key & Load Models
                </button>
            </div>

            <div className="input-group">
                <label>Model</label>
                <select value={model} onChange={(e) => {
                    setModel(e.target.value);
                    setStatus("Idle"); // Clear previous errors
                }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e6e6e6' }}>
                    {availableModels.length > 0 ? (
                        availableModels.map(m => (
                            <option key={m.name} value={m.name}>{m.displayName || m.name}</option>
                        ))
                    ) : (
                        <>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                            <option value="gemini-pro">Gemini Pro 1.0</option>
                        </>
                    )}
                </select>
            </div>

            <div className="input-group">
                <label>Context (Optional)</label>
                <textarea
                    value={promptContext}
                    onChange={(e) => setPromptContext(e.target.value)}
                    placeholder="E.g., Login screen with social auth"
                    rows={3}
                />
            </div>

            <div className="actions">
                <button onClick={handleRename} disabled={status === "Processing..." || selectionStats.count === 0}>
                    {status === "Processing..." ? "Renaming..." : "Rename Selected Layers"}
                </button>
            </div>

            {status !== "Idle" && <div className="status">{status}</div>}

            <div style={{ marginTop: 'auto', paddingTop: '16px', textAlign: 'center', color: '#aaa', fontSize: '10px' }}>
                Made by Rensi Meila
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById("react-page")!);
root.render(<App />);
