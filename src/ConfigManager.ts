import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CovegenConfig {
    toolPath: string;
    model: string;
    maxAttempts: number;
    coverageThreshold: number;
    testCommand: string;
    coverageType: string;
    testFileExtension: string;
    customPrompt?: string;
    coveragePath: string;
    includeFiles: string[];
    apiBase?: string;
}

const DEFAULT_CONFIG: CovegenConfig = {
    toolPath: '',
    model: 'gpt-4',
    maxAttempts: 3,
    coverageThreshold: 95,
    testCommand: 'npm test',
    coverageType: 'cobertura',
    testFileExtension: '.test.js',
    coveragePath: 'coverage/coverage.xml',
    includeFiles: ['package.json', 'vitest.config.js']
};

export class ConfigManager {
    private static instance: ConfigManager;
    private readonly CONFIG_FILE_NAME = 'covegen.json';
    private cachedConfig: Map<string, CovegenConfig> = new Map();
    
    private constructor() {}
    
    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    
    /**
     * 获取当前用户名
     */
    public getCurrentUsername(): string {
        try {
            // 首选方式是使用 os.userInfo().username
            return os.userInfo().username;
        } catch (error) {
            // 备用方式是使用环境变量
            return process.env.USER || process.env.USERNAME || 'user';
        }
    }
    
    /**
     * 替换工具路径中的用户名
     * 将路径中的 /Users/bin/ 替换为当前用户的路径
     */
    private replaceUsernameInPath(toolPath: string): string {
        if (!toolPath) return toolPath;
        
        const currentUsername = this.getCurrentUsername();
        
        // 检查路径是否包含 /Users/bin/ 或其变体
        const userPathRegex = /\/Users\/bin\//;
        if (userPathRegex.test(toolPath)) {
            return toolPath.replace(userPathRegex, `/Users/${currentUsername}/`);
        }
        
        // Windows 路径支持
        const windowsPathRegex = /C:\\Users\\bin\\/i;
        if (windowsPathRegex.test(toolPath)) {
            return toolPath.replace(windowsPathRegex, `C:\\Users\\${currentUsername}\\`);
        }
        
        return toolPath;
    }
    
    /**
     * Get the configuration for a specific project workspace
     * @param workspacePath The workspace path to get configuration for
     * @returns The configuration for the project
     */
    public getConfig(workspacePath?: string): CovegenConfig {
        if (!workspacePath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { ...DEFAULT_CONFIG };
            }
            workspacePath = workspaceFolder.uri.fsPath;
        }
        
        // Return cached config if available
        if (this.cachedConfig.has(workspacePath)) {
            const cachedConfig = { ...this.cachedConfig.get(workspacePath)! };
            cachedConfig.toolPath = this.replaceUsernameInPath(cachedConfig.toolPath);
            return cachedConfig;
        }
        
        // Try to read from project config file
        const projectConfig = this.readProjectConfig(workspacePath);
        
        if (projectConfig) {
            // 更新路径中的用户名
            projectConfig.toolPath = this.replaceUsernameInPath(projectConfig.toolPath);
            
            // Cache the config
            this.cachedConfig.set(workspacePath, { ...projectConfig });
            return projectConfig;
        }
        
        // Fall back to VSCode configuration
        const vsCodeConfig = this.readVSCodeConfig();
        
        // 更新路径中的用户名
        vsCodeConfig.toolPath = this.replaceUsernameInPath(vsCodeConfig.toolPath);
        
        // Cache the config
        this.cachedConfig.set(workspacePath, { ...vsCodeConfig });
        return vsCodeConfig;
    }
    
    /**
     * Read configuration from project's covegen.json file
     */
    private readProjectConfig(workspacePath: string): CovegenConfig | null {
        const configPath = path.join(workspacePath, this.CONFIG_FILE_NAME);
        
        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                const parsedConfig = JSON.parse(configContent);
                
                // Merge with default config to ensure all properties exist
                return { ...DEFAULT_CONFIG, ...parsedConfig };
            }
        } catch (error) {
            console.error(`Error reading project config: ${error}`);
        }
        
        return null;
    }
    
    /**
     * Read configuration from VSCode settings
     */
    private readVSCodeConfig(): CovegenConfig {
        const config = vscode.workspace.getConfiguration('testGenerator');
        
        return {
            toolPath: config.get<string>('toolPath', DEFAULT_CONFIG.toolPath),
            model: config.get<string>('model', DEFAULT_CONFIG.model),
            maxAttempts: config.get<number>('maxAttempts', DEFAULT_CONFIG.maxAttempts),
            coverageThreshold: config.get<number>('coverageThreshold', DEFAULT_CONFIG.coverageThreshold),
            testCommand: config.get<string>('testCommand', DEFAULT_CONFIG.testCommand),
            coverageType: config.get<string>('coverageType', DEFAULT_CONFIG.coverageType),
            testFileExtension: config.get<string>('testFileExtension', DEFAULT_CONFIG.testFileExtension),
            customPrompt: config.get<string>('customPrompt'),
            coveragePath: config.get<string>('coveragePath', DEFAULT_CONFIG.coveragePath),
            includeFiles: config.get<string[]>('includeFiles', DEFAULT_CONFIG.includeFiles),
            apiBase: config.get<string>('apiBase')
        };
    }
    
    /**
     * Save configuration to project's covegen.json file
     */
    public async saveProjectConfig(config: CovegenConfig, workspacePath?: string): Promise<boolean> {
        if (!workspacePath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return false;
            }
            workspacePath = workspaceFolder.uri.fsPath;
        }
        
        // 确保配置文件中保存的是原始路径
        // 因为用户名可能会变化，所以在保存时我们保持原样
        // 当读取时再执行动态替换
        
        const configPath = path.join(workspacePath, this.CONFIG_FILE_NAME);
        
        try {
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            
            // Update cache
            this.cachedConfig.set(workspacePath, { ...config });
            
            return true;
        } catch (error) {
            console.error(`Error saving project config: ${error}`);
            return false;
        }
    }
    
    /**
     * Check if a project configuration file exists
     */
    public hasProjectConfig(workspacePath?: string): boolean {
        if (!workspacePath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return false;
            }
            workspacePath = workspaceFolder.uri.fsPath;
        }
        
        const configPath = path.join(workspacePath, this.CONFIG_FILE_NAME);
        return fs.existsSync(configPath);
    }
    
    /**
     * Clear the configuration cache
     */
    public clearCache(): void {
        this.cachedConfig.clear();
    }
} 