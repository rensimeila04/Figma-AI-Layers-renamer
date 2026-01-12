import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./ui.css"; // We'll create this next

function App() {
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState("gemini-1.5-flash");
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [promptContext, setPromptContext] = useState("");
    const [status, setStatus] = useState("Idle");

    useEffect(() => {
        // Request initial data like stored API key
        parent.postMessage({ pluginMessage: { type: "request-storage" } }, "*");

        window.onmessage = (event) => {
            const { type, payload } = event.data.pluginMessage;
            if (type === "loaded-storage") {
                if (payload.apiKey) {
                    setApiKey(payload.apiKey);
                    fetchModels(payload.apiKey); // Auto-fetch models if key exists
                }
            } else if (type === "layers-renamed") {
                setStatus("Layers renamed successfully!");
                setTimeout(() => setStatus("Idle"), 3000);
            } else if (type === "layers-data-for-ai") {
                // payload: { layers, context, apiKey, model }
                const { layers, context, apiKey, model } = payload;
                setStatus(`Using ${model}...`);
                (async () => { // Wrap async call in an IIFE
                    try {
                        const renames = await callLLM(apiKey, model, context, layers);
                        // Send renames back to plugin code
                        parent.postMessage({ pluginMessage: { type: "apply-renames", renames } }, "*");
                    } catch (error) {
                        console.error(error);
                        setStatus("Error: " + (error instanceof Error ? error.message : String(error)));
                    }
                })();
            } else if (type === "error") {
                setStatus(`Error: ${payload}`);
            }
        };
    }, []);

    // Simple Gemini API call
    const callLLM = async (apiKey: string, model: string, context: string, layers: any[]) => {
        // This is a simplified prompt. You can enhance it.
        const prompt = `
            You are a helper for Figma. Rename the following layers AND all their children recursively to be descriptive and professional based on their content/context.
            Context: ${context || "None provided"}
            
            Hierarchy to rename (JSON):
            ${JSON.stringify(layers, null, 2)}
            
            Return ONLY a valid JSON object mapping original layer IDs to new names for ALL renamed nodes.
            Example: { "1:2": "Submit Button", "1:3": "Button Label", "1:4": "Icon" }
            Do not include markdown formatting or backticks.
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
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

        return JSON.parse(cleanText);
    };

    const fetchModels = async (key: string) => {
        if (!key) return;
        setStatus("Fetching models...");
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!response.ok) throw new Error("Failed to list models");
            const data = await response.json();
            // Filter for generateContent supported models
            const models = data.models
                .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
                .map((m: any) => ({
                    name: m.name.replace("models/", ""),
                    displayName: m.displayName
                }));

            setAvailableModels(models);
            if (models.length > 0) setModel(models[0].name);
            setStatus("Models loaded. Ready to rename.");
            // setTimeout(() => setStatus("Idle"), 2000); // Keep it visible so they know it worked
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

            <div className="input-group">
                <label>API Key (Gemini/OpenAI)</label>
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                        saveKey(e.target.value);
                        // Debounce or manual trigger would be better, but for now simple:
                    }}
                    onBlur={() => fetchModels(apiKey)}
                    placeholder="Enter API Key"
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
                <button onClick={handleRename} disabled={status === "Processing..."}>
                    {status === "Processing..." ? "Renaming..." : "Rename Selected Layers"}
                </button>
            </div>

            {status !== "Idle" && <div className="status">{status}</div>}
        </div>
    );
}

const root = createRoot(document.getElementById("react-page")!);
root.render(<App />);
