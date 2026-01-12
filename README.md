# Figma AI Layer Renamer

A Figma plugin that uses Google's Gemini AI to intelligently rename your layers and frames based on their content and context. Supports recursive renaming for nested layers.

## Features
- **Smart Renaming**: Uses Gemini AI to understand your design structure.
- **Recursive**: Renames not just the selected layer, but all children inside it.
- **Bring Your Own Key**: Secure client-side only operation. Your API Key is stored locally.
- **Model Selection**: Choose between Gemini 1.5 Flash (Fast), 1.5 Pro, or others available to your account.

## Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later recommended)
- Figma Desktop App

## Setup & Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd figma-ai-renamer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the plugin**
   ```bash
   npm run build
   ```
   This will create a `dist/` folder containing `code.js` and `src/index.html`.

## How to Run in Figma

1. Open **Figma Desktop App**.
2. Go to **Menu** > **Plugins** > **Development** > **Import plugin from manifest...**.
3. Select the `manifest.json` file located in this project's root directory.
4. The plugin **"AI Layer Renamer"** will appear in your plugins list.

## Usage

1. Select the layers or frames you want to rename.
2. Run the plugin (**Plugins** > **Development** > **AI Layer Renamer**).
3. Enter your **Google Gemini API Key**.
   - You can get one for free at [Google AI Studio](https://aistudio.google.com/app/apikey).
4. (Optional) Click **"Check Key & Load Models"** to see which models are available for your account.
5. Click **"Rename Selected Layers"**.

> **Note on Free Tier**: If you are using a free Gemini API Key, you may encounter Rate Limit errors (Error 429). The free tier has strict limits (e.g., ~2-4 requests per minute or less depending on complexity). If this happens, please wait about 1 minute before trying again.

## Security

- **Client-Side Only**: This plugin runs entirely within Figma.
- **No Backend**: Your API Key and design data are sent directly to Google's API. No intermediate server collects your data.
- **Local Storage**: Your API Key is saved in your local Figma client storage for convenience.

## Development

- **UI**: React + TypeScript + Vite.
- **Plugin Logic**: TypeScript + esbuild.

To run in watch mode during development:
```bash
npm run dev
```

## Author
**Rensi Meila**
Built with ❤️ using Gemini API.
