import * as vscode from 'vscode';
import { ConfigManager, CovegenConfig } from './ConfigManager';

// 扩展 QuickPickItem 接口，添加我们需要的属性
interface ConfigQuickPickItem extends vscode.QuickPickItem {
    key: keyof CovegenConfig | 'save' | 'cancel';
    description: string; // 确保description不为空
}

export class ProjectConfigCommand {
    public static async createOrEditProjectConfig(): Promise<void> {
        const configManager = ConfigManager.getInstance();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open');
            return;
        }
        
        const workspacePath = workspaceFolder.uri.fsPath;
        
        // Check if project config exists
        const hasProjectConfig = configManager.hasProjectConfig(workspacePath);
        const config = configManager.getConfig(workspacePath);
        
        // Create new or edit existing config
        const result = await this.showConfigurationUI(config, hasProjectConfig);
        
        if (result) {
            const success = await configManager.saveProjectConfig(result, workspacePath);
            
            if (success) {
                vscode.window.showInformationMessage(
                    hasProjectConfig
                        ? 'Project configuration updated successfully'
                        : 'Project configuration created successfully'
                );
            } else {
                vscode.window.showErrorMessage('Failed to save project configuration');
            }
        }
    }
    
    private static async showConfigurationUI(
        currentConfig: CovegenConfig,
        isExisting: boolean
    ): Promise<CovegenConfig | undefined> {
        // Create a copy of the config to modify
        const config = { ...currentConfig };
        
        // Create QuickPick for configuration
        const quickPick = vscode.window.createQuickPick<ConfigQuickPickItem>();
        quickPick.title = isExisting ? 'Edit Project Configuration' : 'Create Project Configuration';
        quickPick.placeholder = 'Select a configuration option to edit';
        
        // Define configuration items
        const items: ConfigQuickPickItem[] = [
            {
                label: `Tool Path: ${config.toolPath || '(not set)'}`,
                description: 'Path to the Covegen binary',
                key: 'toolPath'
            },
            {
                label: `Model: ${config.model}`,
                description: 'AI model to use for test generation',
                key: 'model'
            },
            {
                label: `Max Attempts: ${config.maxAttempts}`,
                description: 'Maximum number of attempts for test generation',
                key: 'maxAttempts'
            },
            {
                label: `Coverage Threshold: ${config.coverageThreshold}%`,
                description: 'Minimum coverage threshold',
                key: 'coverageThreshold'
            },
            {
                label: `Test Command: ${config.testCommand}`,
                description: 'Command to run tests',
                key: 'testCommand'
            },
            {
                label: `Coverage Type: ${config.coverageType}`,
                description: 'Type of coverage report',
                key: 'coverageType'
            },
            {
                label: `Test File Extension: ${config.testFileExtension}`,
                description: 'Extension for test files',
                key: 'testFileExtension'
            },
            {
                label: `Custom Prompt: ${config.customPrompt || '(not set)'}`,
                description: 'Custom prompt for test generation',
                key: 'customPrompt'
            },
            {
                label: `Coverage Path: ${config.coveragePath}`,
                description: 'Path to coverage report',
                key: 'coveragePath'
            },
            {
                label: `API Base: ${config.apiBase || '(not set)'}`,
                description: 'Base URL for API',
                key: 'apiBase'
            },
            {
                label: `Include Files: ${config.includeFiles.join(', ')}`,
                description: 'Files to include in test generation',
                key: 'includeFiles'
            },
            {
                label: '✅ Save Configuration',
                description: 'Save the current configuration',
                key: 'save'
            },
            {
                label: '❌ Cancel',
                description: 'Cancel configuration editing',
                key: 'cancel'
            }
        ];
        
        quickPick.items = items;
        
        return new Promise<CovegenConfig | undefined>((resolve) => {
            quickPick.onDidChangeSelection(async (selection) => {
                const selected = selection[0];
                
                if (!selected) {
                    return;
                }
                
                if (selected.key === 'save') {
                    quickPick.hide();
                    resolve(config);
                    return;
                }
                
                if (selected.key === 'cancel') {
                    quickPick.hide();
                    resolve(undefined);
                    return;
                }
                
                // Handle different types of configuration options
                if (selected.key === 'includeFiles') {
                    const input = await vscode.window.showInputBox({
                        prompt: 'Enter include files (comma-separated list)',
                        value: config.includeFiles.join(', ')
                    });
                    
                    if (input !== undefined) {
                        config.includeFiles = input.split(',').map(file => file.trim()).filter(Boolean);
                        
                        // Update the items to reflect changes
                        quickPick.items = items.map(item => 
                            item.key === 'includeFiles'
                                ? { ...item, label: `Include Files: ${config.includeFiles.join(', ')}` }
                                : item
                        );
                    }
                } else if (selected.key === 'maxAttempts' || selected.key === 'coverageThreshold') {
                    // Handle numeric input
                    const input = await vscode.window.showInputBox({
                        prompt: `Enter new value for ${selected.description}`,
                        value: String(config[selected.key])
                    });
                    
                    if (input !== undefined) {
                        const numValue = parseInt(input, 10);
                        if (!isNaN(numValue)) {
                            config[selected.key] = numValue;
                            
                            // Update the item label
                            const suffix = selected.key === 'coverageThreshold' ? '%' : '';
                            quickPick.items = items.map(item => 
                                item.key === selected.key
                                    ? { ...item, label: `${selected.description.split(':')[0]}: ${numValue}${suffix}` }
                                    : item
                            );
                        }
                    }
                } else {
                    // Handle text input
                    const input = await vscode.window.showInputBox({
                        prompt: `Enter new value for ${selected.description}`,
                        value: config[selected.key] || ''
                    });
                    
                    if (input !== undefined) {
                        // @ts-ignore - Type safety is ensured by our interface and conditional checks
                        config[selected.key] = input;
                        
                        // Update the items to reflect changes
                        quickPick.items = items.map(item => 
                            item.key === selected.key
                                ? { ...item, label: `${selected.description.split(':')[0]}: ${input || '(not set)'}` }
                                : item
                        );
                    }
                }
            });
            
            quickPick.onDidHide(() => {
                resolve(undefined);
            });
            
            quickPick.show();
        });
    }
} 