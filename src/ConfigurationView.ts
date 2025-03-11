import * as vscode from 'vscode';

export class ConfigurationView {
    private static currentPanel: ConfigurationView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ConfigurationView.currentPanel) {
            ConfigurationView.currentPanel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'testGeneratorConfig',
            'COVEGEN SETTINGS',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        ConfigurationView.currentPanel = new ConfigurationView(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveConfig':
                        this._saveConfiguration(message.config);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _saveConfiguration(config: any) {
        try {
            const configuration = vscode.workspace.getConfiguration('testGenerator');
            
            // Update each configuration value
            for (const key of Object.keys(config)) {
                await configuration.update(key, config[key], vscode.ConfigurationTarget.Global);
            }

            // Show success message in the webview
            this._panel.webview.postMessage({ 
                type: 'success', 
                message: 'Configuration saved successfully!' 
            });

            // Show success message in VSCode
            vscode.window.showInformationMessage('COVEGEN configuration saved successfully!');
        } catch (error: any) {
            // Show error message in the webview
            this._panel.webview.postMessage({ 
                type: 'error', 
                message: 'Failed to save configuration. Please try again.' 
            });

            // Show error message in VSCode
            vscode.window.showErrorMessage(`Failed to save configuration: ${error?.message || 'Unknown error'}`);
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = "COVEGEN SETTINGS";
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const config = vscode.workspace.getConfiguration('testGenerator');
        const includeFiles = config.get<string[]>('includeFiles') || [];

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>COVEGEN SETTINGS</title>
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input, select, textarea {
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .description {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 5px;
                }
                .message {
                    padding: 10px;
                    margin-bottom: 15px;
                    border-radius: 4px;
                    display: none;
                }
                .success {
                    background: var(--vscode-testing-iconPassed);
                    color: var(--vscode-foreground);
                }
                .error {
                    background: var(--vscode-testing-iconFailed);
                    color: var(--vscode-foreground);
                }
            </style>
        </head>
        <body>
            <div id="message" class="message"></div>
            <form id="configForm">
                <div class="form-group">
                    <label for="model">AI Model</label>
                    <div class="description">Select the AI model to use for test generation</div>
                    <select id="model" name="model">
                        <option value="codestral/codestral-2501" ${config.get('model') === 'codestral/codestral-2501' ? 'selected' : ''}>Codestral 2501</option>
                        <option value="codestral/codestral-7b" ${config.get('model') === 'codestral/codestral-7b' ? 'selected' : ''}>Codestral 7B</option>
                        <option value="codestral/codestral-34b" ${config.get('model') === 'codestral/codestral-34b' ? 'selected' : ''}>Codestral 34B</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="maxAttempts">Maximum Attempts</label>
                    <div class="description">Number of attempts for test generation (1-5)</div>
                    <input type="number" id="maxAttempts" name="maxAttempts" min="1" max="5" value="${config.get('maxAttempts')}" />
                </div>

                <div class="form-group">
                    <label for="coverageThreshold">Coverage Threshold (%)</label>
                    <div class="description">Skip test generation if coverage is above this threshold</div>
                    <input type="number" id="coverageThreshold" name="coverageThreshold" min="0" max="100" value="${config.get('coverageThreshold')}" />
                </div>

                <div class="form-group">
                    <label for="testCommand">Test Command</label>
                    <div class="description">Command to run tests and generate coverage</div>
                    <input type="text" id="testCommand" name="testCommand" value="${config.get('testCommand')}" />
                </div>

                <div class="form-group">
                    <label for="coverageType">Coverage Report Type</label>
                    <div class="description">Type of coverage report to generate</div>
                    <select id="coverageType" name="coverageType">
                        <option value="cobertura" ${config.get('coverageType') === 'cobertura' ? 'selected' : ''}>Cobertura</option>
                        <option value="lcov" ${config.get('coverageType') === 'lcov' ? 'selected' : ''}>LCOV</option>
                        <option value="jacoco" ${config.get('coverageType') === 'jacoco' ? 'selected' : ''}>JaCoCo</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="testFileExtension">Test File Extension</label>
                    <div class="description">Extension to use for generated test files</div>
                    <select id="testFileExtension" name="testFileExtension">
                        <option value=".test.js" ${config.get('testFileExtension') === '.test.js' ? 'selected' : ''}>.test.js</option>
                        <option value=".test.ts" ${config.get('testFileExtension') === '.test.ts' ? 'selected' : ''}>.test.ts</option>
                        <option value=".spec.js" ${config.get('testFileExtension') === '.spec.js' ? 'selected' : ''}>.spec.js</option>
                        <option value=".spec.ts" ${config.get('testFileExtension') === '.spec.ts' ? 'selected' : ''}>.spec.ts</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="coveragePath">Coverage Report Path</label>
                    <div class="description">Path to the coverage report file (relative to workspace root)</div>
                    <input type="text" id="coveragePath" name="coveragePath" value="${config.get('coveragePath')}" />
                </div>

                <div class="form-group">
                    <label for="apiBase">API Base URL</label>
                    <div class="description">Base URL for API requests (optional)</div>
                    <input type="text" id="apiBase" name="apiBase" value="${config.get('apiBase')}" placeholder="e.g., https://api.example.com" />
                </div>

                <div class="form-group">
                    <label for="includeFiles">Include Files</label>
                    <div class="description">Additional files to include in test generation (one per line)</div>
                    <textarea id="includeFiles" name="includeFiles" rows="4" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;">${includeFiles.join('\n')}</textarea>
                </div>

                <div class="form-group">
                    <label for="customPrompt">Custom Prompt</label>
                    <div class="description">Custom prompt to pass to the test generation model</div>
                    <textarea id="customPrompt" name="customPrompt" rows="4" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;">${config.get('customPrompt') || ''}</textarea>
                </div>

                <button type="submit" id="submitButton">Save Configuration</button>
            </form>

            <script>
                const vscode = acquireVsCodeApi();
                const form = document.getElementById('configForm');
                const submitButton = document.getElementById('submitButton');
                const messageDiv = document.getElementById('message');

                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    messageDiv.textContent = message.message;
                    messageDiv.className = 'message ' + message.type;
                    messageDiv.style.display = 'block';
                    
                    // Re-enable the submit button
                    submitButton.disabled = false;

                    // Hide the message after 3 seconds
                    setTimeout(() => {
                        messageDiv.style.display = 'none';
                    }, 3000);
                });
                
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    
                    // Disable the submit button while saving
                    submitButton.disabled = true;
                    
                    const formData = new FormData(e.target);
                    const config = {};
                    
                    try {
                        for (let [key, value] of formData.entries()) {
                            if (key === 'maxAttempts' || key === 'coverageThreshold') {
                                config[key] = parseInt(value);
                            } else if (key === 'includeFiles') {
                                config[key] = value.split('\\n').filter(line => line.trim() !== '');
                            } else {
                                config[key] = value;
                            }
                        }
                        
                        vscode.postMessage({
                            command: 'saveConfig',
                            config: config
                        });
                    } catch (error) {
                        // Show error message
                        messageDiv.textContent = 'Error processing form data: ' + error.message;
                        messageDiv.className = 'message error';
                        messageDiv.style.display = 'block';
                        
                        // Re-enable the submit button
                        submitButton.disabled = false;
                        
                        // Hide the error message after 3 seconds
                        setTimeout(() => {
                            messageDiv.style.display = 'none';
                        }, 3000);
                    }
                });
            </script>
        </body>
        </html>`;
    }

    public reveal(column?: vscode.ViewColumn) {
        this._panel.reveal(column);
    }

    public dispose() {
        ConfigurationView.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
} 