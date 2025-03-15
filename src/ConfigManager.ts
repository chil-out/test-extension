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
                
                // 将命令行参数格式转换为内部格式
                const internalConfig: Partial<CovegenConfig> = {};
                
                // 处理基本字段
                if (parsedConfig["tool-path"] !== undefined) internalConfig.toolPath = parsedConfig["tool-path"];
                if (parsedConfig["model"] !== undefined) internalConfig.model = parsedConfig["model"];
                if (parsedConfig["max-attempts"] !== undefined) internalConfig.maxAttempts = parsedConfig["max-attempts"];
                if (parsedConfig["coverage-threshold"] !== undefined) internalConfig.coverageThreshold = parsedConfig["coverage-threshold"];
                if (parsedConfig["test-command"] !== undefined) internalConfig.testCommand = parsedConfig["test-command"];
                if (parsedConfig["coverage-type"] !== undefined) internalConfig.coverageType = parsedConfig["coverage-type"];
                if (parsedConfig["test-file-extension"] !== undefined) internalConfig.testFileExtension = parsedConfig["test-file-extension"];
                if (parsedConfig["coverage-path"] !== undefined) internalConfig.coveragePath = parsedConfig["coverage-path"];
                if (parsedConfig["include-files"] !== undefined) internalConfig.includeFiles = parsedConfig["include-files"];
                
                // 处理可选字段
                if (parsedConfig["api-base"] !== undefined) internalConfig.apiBase = parsedConfig["api-base"];
                if (parsedConfig["custom-prompt"] !== undefined) internalConfig.customPrompt = parsedConfig["custom-prompt"];
                
                // 如果配置使用了旧格式（直接使用内部字段名称），则也支持它们
                if (parsedConfig.toolPath !== undefined) internalConfig.toolPath = parsedConfig.toolPath;
                if (parsedConfig.model !== undefined) internalConfig.model = parsedConfig.model;
                if (parsedConfig.maxAttempts !== undefined) internalConfig.maxAttempts = parsedConfig.maxAttempts;
                if (parsedConfig.coverageThreshold !== undefined) internalConfig.coverageThreshold = parsedConfig.coverageThreshold;
                if (parsedConfig.testCommand !== undefined) internalConfig.testCommand = parsedConfig.testCommand;
                if (parsedConfig.coverageType !== undefined) internalConfig.coverageType = parsedConfig.coverageType;
                if (parsedConfig.testFileExtension !== undefined) internalConfig.testFileExtension = parsedConfig.testFileExtension;
                if (parsedConfig.coveragePath !== undefined) internalConfig.coveragePath = parsedConfig.coveragePath;
                if (parsedConfig.includeFiles !== undefined) internalConfig.includeFiles = parsedConfig.includeFiles;
                if (parsedConfig.apiBase !== undefined) internalConfig.apiBase = parsedConfig.apiBase;
                if (parsedConfig.customPrompt !== undefined) internalConfig.customPrompt = parsedConfig.customPrompt;
                
                // Merge with default config to ensure all properties exist
                return { ...DEFAULT_CONFIG, ...internalConfig };
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
        
        // 创建与命令行参数格式匹配的配置对象
        const commandLineConfig = {
            "tool-path": config.toolPath,
            "model": config.model,
            "max-attempts": config.maxAttempts,
            "coverage-threshold": config.coverageThreshold,
            "test-command": config.testCommand,
            "coverage-type": config.coverageType,
            "test-file-extension": config.testFileExtension,
            "coverage-path": config.coveragePath,
            "include-files": config.includeFiles
        };
        
        // 添加可选配置
        if (config.apiBase) {
            (commandLineConfig as any)["api-base"] = config.apiBase;
        }
        
        if (config.customPrompt) {
            (commandLineConfig as any)["custom-prompt"] = config.customPrompt;
        }
        
        const configPath = path.join(workspacePath, this.CONFIG_FILE_NAME);
        
        try {
            await fs.promises.writeFile(configPath, JSON.stringify(commandLineConfig, null, 2), 'utf8');
            
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