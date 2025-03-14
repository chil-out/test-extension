import * as vscode from 'vscode';
import { ConfigManager } from './ConfigManager';

export class ConfigurationView {
    private static currentPanel: ConfigurationView | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _configManager: ConfigManager;
    private _isProjectConfig: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ConfigurationView.currentPanel) {
            // 当再次打开面板时，强制刷新配置
            ConfigurationView.currentPanel._refreshConfiguration();
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
        this._configManager = ConfigManager.getInstance();

        // Check if project config exists
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this._isProjectConfig = this._configManager.hasProjectConfig(workspaceFolder.uri.fsPath);
        }

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    // 当面板变为可见时，刷新配置
                    this._refreshConfiguration();
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
                    case 'createProjectConfig':
                        this._createProjectConfig();
                        return;
                    case 'useVSCodeConfig':
                        this._switchToVSCodeConfig();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _saveConfiguration(config: any) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder is open');
            }

            // 在保存前清除缓存
            this._configManager.clearCache();

            if (this._isProjectConfig) {
                // Save to project config file
                await this._configManager.saveProjectConfig(config, workspaceFolder.uri.fsPath);
                
                this._panel.webview.postMessage({ 
                    type: 'success', 
                    message: 'Project configuration saved successfully!' 
                });
                
                vscode.window.showInformationMessage('Project configuration saved successfully!');
            } else {
                // Save to VS Code settings
                const configuration = vscode.workspace.getConfiguration('testGenerator');
                
                // Update each configuration value
                for (const key of Object.keys(config)) {
                    await configuration.update(key, config[key], vscode.ConfigurationTarget.Global);
                }

                this._panel.webview.postMessage({ 
                    type: 'success', 
                    message: 'VS Code configuration saved successfully!' 
                });

                vscode.window.showInformationMessage('VS Code configuration saved successfully!');
            }
            
            // 在保存后刷新视图
            this._refreshConfiguration();
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

    private async _createProjectConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open');
            return;
        }

        try {
            // Get current configuration
            const config = vscode.workspace.getConfiguration('testGenerator');
            const projectConfig = {
                toolPath: config.get('toolPath', ''),
                model: config.get('model', 'gpt-4'),
                maxAttempts: config.get('maxAttempts', 3),
                coverageThreshold: config.get('coverageThreshold', 95),
                testCommand: config.get('testCommand', 'npm test'),
                coverageType: config.get('coverageType', 'cobertura'),
                testFileExtension: config.get('testFileExtension', '.test.js'),
                coveragePath: config.get('coveragePath', 'coverage/coverage.xml'),
                includeFiles: config.get('includeFiles', ['package.json', 'vitest.config.js']),
                apiBase: config.get('apiBase', ''),
                customPrompt: config.get('customPrompt', '')
            };

            // Save to project config file
            const success = await this._configManager.saveProjectConfig(projectConfig, workspaceFolder.uri.fsPath);
            
            if (success) {
                this._isProjectConfig = true;
                this._update(); // Update the view to show project config
                vscode.window.showInformationMessage('Project configuration created successfully!');
            } else {
                vscode.window.showErrorMessage('Failed to create project configuration');
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create project configuration: ${error?.message || 'Unknown error'}`);
        }
    }

    private _switchToVSCodeConfig() {
        this._isProjectConfig = false;
        this._update();
    }

    private _update() {
        const webview = this._panel.webview;
        
        if (this._isProjectConfig) {
            this._panel.title = "COVEGEN PROJECT SETTINGS";
        } else {
            this._panel.title = "COVEGEN GLOBAL SETTINGS";
        }
        
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        // 初始化变量
        let configSource: string;
        let toolPath: string;
        let model: string;
        let maxAttempts: number;
        let coverageThreshold: number;
        let testCommand: string;
        let coverageType: string;
        let testFileExtension: string;
        let coveragePath: string;
        let apiBase: string;
        let customPrompt: string;
        let includeFiles: string[];
        
        if (this._isProjectConfig && workspaceFolder) {
            // 从项目配置文件获取配置
            const projectConfig = this._configManager.getConfig(workspaceFolder.uri.fsPath);
            configSource = 'Project Configuration';
            
            // 分配值
            toolPath = projectConfig.toolPath;
            model = projectConfig.model;
            maxAttempts = projectConfig.maxAttempts;
            coverageThreshold = projectConfig.coverageThreshold;
            testCommand = projectConfig.testCommand;
            coverageType = projectConfig.coverageType;
            testFileExtension = projectConfig.testFileExtension;
            coveragePath = projectConfig.coveragePath;
            apiBase = projectConfig.apiBase || '';
            customPrompt = projectConfig.customPrompt || '';
            includeFiles = projectConfig.includeFiles;
        } else {
            // 从 VS Code 设置获取配置
            const vsCodeConfig = vscode.workspace.getConfiguration('testGenerator');
            configSource = 'VS Code Global Configuration';
            
            // 分配值
            toolPath = vsCodeConfig.get<string>('toolPath', '');
            model = vsCodeConfig.get<string>('model', '');
            maxAttempts = vsCodeConfig.get<number>('maxAttempts', 3);
            coverageThreshold = vsCodeConfig.get<number>('coverageThreshold', 95);
            testCommand = vsCodeConfig.get<string>('testCommand', '');
            coverageType = vsCodeConfig.get<string>('coverageType', '');
            testFileExtension = vsCodeConfig.get<string>('testFileExtension', '');
            coveragePath = vsCodeConfig.get<string>('coveragePath', '');
            apiBase = vsCodeConfig.get<string>('apiBase', '');
            customPrompt = vsCodeConfig.get<string>('customPrompt', '');
            includeFiles = vsCodeConfig.get<string[]>('includeFiles', []);
        }

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
                    margin-right: 8px;
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
                .config-source {
                    padding: 10px;
                    margin-bottom: 15px;
                    background: var(--vscode-editor-background);
                    border-radius: 4px;
                    border-left: 4px solid var(--vscode-activityBar-activeBorder);
                }
                .config-actions {
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="config-source">
                <h2>Currently Editing: ${configSource}</h2>
                ${this._isProjectConfig 
                    ? '<p>This configuration is stored in the covegen.json file in your project root.</p><button id="switchToVSCode">Switch to VS Code Settings</button>' 
                    : '<p>This configuration is stored in your VS Code global settings.</p><button id="createProjectConfig">Create Project Config</button>'}
            </div>
            
            <div id="message" class="message"></div>
            <form id="configForm">
                <div class="form-group">
                    <label for="toolPath">Tool Path</label>
                    <div class="description">Path to the Covegen binary</div>
                    <input type="text" id="toolPath" name="toolPath" value="${toolPath}" />
                </div>

                <div class="form-group">
                    <label for="model">AI Model</label>
                    <div class="description">Select the AI model to use for test generation</div>
                    <select id="model" name="model">
                        <option value="codestral/codestral-2501" ${model === 'codestral/codestral-2501' ? 'selected' : ''}>Codestral 2501</option>
                        <option value="codestral/codestral-7b" ${model === 'codestral/codestral-7b' ? 'selected' : ''}>Codestral 7B</option>
                        <option value="codestral/codestral-34b" ${model === 'codestral/codestral-34b' ? 'selected' : ''}>Codestral 34B</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="maxAttempts">Maximum Attempts</label>
                    <div class="description">Number of attempts for test generation (1-5)</div>
                    <input type="number" id="maxAttempts" name="maxAttempts" min="1" max="5" value="${maxAttempts}" />
                </div>

                <div class="form-group">
                    <label for="coverageThreshold">Coverage Threshold (%)</label>
                    <div class="description">Skip test generation if coverage is above this threshold</div>
                    <input type="number" id="coverageThreshold" name="coverageThreshold" min="0" max="100" value="${coverageThreshold}" />
                </div>

                <div class="form-group">
                    <label for="testCommand">Test Command</label>
                    <div class="description">Command to run tests and generate coverage</div>
                    <input type="text" id="testCommand" name="testCommand" value="${testCommand}" />
                </div>

                <div class="form-group">
                    <label for="coverageType">Coverage Report Type</label>
                    <div class="description">Type of coverage report to generate</div>
                    <select id="coverageType" name="coverageType">
                        <option value="cobertura" ${coverageType === 'cobertura' ? 'selected' : ''}>Cobertura</option>
                        <option value="lcov" ${coverageType === 'lcov' ? 'selected' : ''}>LCOV</option>
                        <option value="jacoco" ${coverageType === 'jacoco' ? 'selected' : ''}>JaCoCo</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="testFileExtension">Test File Extension</label>
                    <div class="description">Extension to use for generated test files</div>
                    <select id="testFileExtension" name="testFileExtension">
                        <option value=".test.js" ${testFileExtension === '.test.js' ? 'selected' : ''}>.test.js</option>
                        <option value=".test.ts" ${testFileExtension === '.test.ts' ? 'selected' : ''}>.test.ts</option>
                        <option value=".spec.js" ${testFileExtension === '.spec.js' ? 'selected' : ''}>.spec.js</option>
                        <option value=".spec.ts" ${testFileExtension === '.spec.ts' ? 'selected' : ''}>.spec.ts</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="coveragePath">Coverage Report Path</label>
                    <div class="description">Path to the coverage report file (relative to workspace root)</div>
                    <input type="text" id="coveragePath" name="coveragePath" value="${coveragePath}" />
                </div>

                <div class="form-group">
                    <label for="apiBase">API Base URL</label>
                    <div class="description">Base URL for API requests (optional)</div>
                    <input type="text" id="apiBase" name="apiBase" value="${apiBase}" placeholder="e.g., https://api.example.com" />
                </div>

                <div class="form-group">
                    <label for="includeFiles">Include Files</label>
                    <div class="description">Additional files to include in test generation (one per line)</div>
                    <textarea id="includeFiles" name="includeFiles" rows="4" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;">${includeFiles.join('\n')}</textarea>
                </div>

                <div class="form-group">
                    <label for="customPrompt">Custom Prompt</label>
                    <div class="description">Custom prompt to pass to the test generation model</div>
                    <textarea id="customPrompt" name="customPrompt" rows="4" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;">${customPrompt}</textarea>
                </div>

                <button type="submit" id="submitButton">Save Configuration</button>
            </form>

            <script>
                const vscode = acquireVsCodeApi();
                const form = document.getElementById('configForm');
                const submitButton = document.getElementById('submitButton');
                const messageDiv = document.getElementById('message');
                
                // Handle project config related buttons
                const createProjectConfigBtn = document.getElementById('createProjectConfig');
                if (createProjectConfigBtn) {
                    createProjectConfigBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'createProjectConfig'
                        });
                    });
                }
                
                const switchToVSCodeBtn = document.getElementById('switchToVSCode');
                if (switchToVSCodeBtn) {
                    switchToVSCodeBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'useVSCodeConfig'
                        });
                    });
                }

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

    private async _refreshConfiguration() {
        // 清除缓存
        this._configManager.clearCache();
        
        // 检查是否有项目配置
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this._isProjectConfig = this._configManager.hasProjectConfig(workspaceFolder.uri.fsPath);
        }
        
        // 更新视图
        this._update();
    }
} 