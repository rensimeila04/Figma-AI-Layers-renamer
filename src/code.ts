// This code runs in the main Figma thread

figma.showUI(__html__, { width: 300, height: 400 });

// Helper to traverse node and getting meaningful data
function getNodeData(node: SceneNode): any {
    const data: any = {
        id: node.id,
        name: node.name,
        type: node.type,
        // Add more properties if needed for context (e.g., text content for TextNodes)
        text: node.type === "TEXT" ? node.characters : undefined,
    };

    if ("children" in node) {
        data.children = (node as ChildrenMixin).children.map(getNodeData);
    }

    return data;
}

figma.ui.onmessage = async (msg) => {
    if (msg.type === "save-api-key") {
        await figma.clientStorage.setAsync("apiKey", msg.apiKey);
    } else if (msg.type === "request-storage") {
        const apiKey = await figma.clientStorage.getAsync("apiKey");
        figma.ui.postMessage({ type: "loaded-storage", payload: { apiKey } });
    } else if (msg.type === "rename-layers") {
        const selection = figma.currentPage.selection;

        if (selection.length === 0) {
            figma.ui.postMessage({ type: "error", payload: "No layers selected" });
            return;
        }

        const layersData = selection.map(getNodeData);

        // We can't make network requests here, so we send data back to UI to do it
        // We can't make network requests here, so we send data back to UI to do it.
        // Wait, actually Figma Plugins can make network requests in the UI thread. 
        // So we should send the layer data to the UI, let the UI call the LLM, 
        // and then the UI sends back the new names. 
        // BUT, the msg types suggest the UI initiated this.
        // So we need to send the layer data BACK to the UI now.

        figma.ui.postMessage({
            type: "layers-data-for-ai",
            payload: { layers: layersData, context: msg.context, apiKey: msg.apiKey, model: msg.model }
        });
    } else if (msg.type === "apply-renames") {
        // UI sends back { [id]: "new name" }
        const { renames } = msg;
        let count = 0;

        console.log("Applying renames:", renames); // Debug log

        // Iterate over the IDs returned by AI, not just the selection
        for (const id of Object.keys(renames)) {
            const node = figma.getNodeById(id);
            if (node) {
                // Ensure we don't accidentally rename things strictly outside our scope 
                // (though LLM should only see what we sent)
                node.name = renames[id];
                count++;
            }
        }
        figma.ui.postMessage({ type: "layers-renamed", count });
    }
};
