import * as vscode from 'vscode';
import { exec } from 'child_process';
import { TestCodeLensProvider } from './CodeLensProvider';
import { FileTreeProvider } from './FileTreeProvider';

export function activate(context: vscode.ExtensionContext) {


	let codeLensProvider = new TestCodeLensProvider();
	let disposableCodeLens = vscode.languages.registerCodeLensProvider(
		[
			{ scheme: 'file', language: 'javascript' },
			{ scheme: 'file', language: 'typescript' }
		],
		codeLensProvider
	);
	context.subscriptions.push(disposableCodeLens);

	// Register the test generation command
	let disposable = vscode.commands.registerCommand('extension.generateTests', async (fileUri?: vscode.Uri) => {
		console.log('Command triggered with URI:', {
			uri: fileUri?.toString(),
			scheme: fileUri?.scheme,
			path: fileUri?.path,
			fsPath: fileUri?.fsPath
		});
		
		// Ensure we have a valid URI
		if (!fileUri || !fileUri.scheme) {
			if (vscode.window.activeTextEditor) {
				fileUri = vscode.window.activeTextEditor.document.uri;
				console.log('Using active editor URI:', {
					uri: fileUri.toString(),
					scheme: fileUri.scheme,
					path: fileUri.path,
					fsPath: fileUri.fsPath
				});
			} else {
				vscode.window.showErrorMessage('No file selected for test generation');
				return;
			}
		}

		try {
			// Convert to proper file URI if needed
			if (fileUri.scheme !== 'file') {
				fileUri = vscode.Uri.file(fileUri.path);
				console.log('Converted to file URI:', {
					uri: fileUri.toString(),
					scheme: fileUri.scheme,
					path: fileUri.path,
					fsPath: fileUri.fsPath
				});
			}

			console.log('Checking file exists:', fileUri.fsPath);
			const stat = await vscode.workspace.fs.stat(fileUri);
			console.log('File stat:', stat.type === vscode.FileType.File ? 'Is a file' : 'Not a file');

			if (stat.type !== vscode.FileType.File) {
				vscode.window.showErrorMessage('Selected path is not a file');
				return;
			}

			// Call test generation with the file URI
			generateTests(fileUri);
		} catch (error: any) {
			console.error('Error in command handler:', error);
			vscode.window.showErrorMessage(`Error accessing file: ${error?.message || 'Unknown error'}`);
			return;
		}
	});

	context.subscriptions.push(disposable);

	// 注册 TreeDataProvider
	const fileTreeProvider = new FileTreeProvider();
	const treeView = vscode.window.createTreeView('fileExplorerWithMethods', {
		treeDataProvider: fileTreeProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// 可选：提供一个刷新命令
	let disposableRefresh = vscode.commands.registerCommand('extension.refreshFileTree', () => {
		fileTreeProvider.refresh();
	});
	context.subscriptions.push(disposableRefresh);
}

function generateTests(targetUri: vscode.Uri) {
	if (!targetUri || !targetUri.fsPath) {
		vscode.window.showErrorMessage('Invalid file selected for test generation');
		return;
	}

	const config = vscode.workspace.getConfiguration('testGenerator');
	const toolPath = config.get<string>('toolPath');

	if (!toolPath) {
		vscode.window.showErrorMessage('Test generation tool path not configured');
		return;
	}

	// Get workspace root directory
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace is open');
		return;
	}

	// Get current file information
	const sourceFilePath = targetUri.fsPath;
	const fileNameWithoutExt = sourceFilePath.replace(/\.[^/.]+$/, '');
	const testFilePath = `${fileNameWithoutExt}.test.js`;

	// 构建相对于工作区的路径
	const workspacePath = workspaceFolder.uri.fsPath;
	const coveragePath = `${workspacePath}/coverage/coverage.xml`;
	const packageJsonPath = `${workspacePath}/package.json`;
	const vitestConfigPath = `${workspacePath}/vitest.config.js`;

	const command = `"${toolPath}" gen` +
		` --test-command "npx vitest run --coverage"` +
		` --code-coverage-report-path "${coveragePath}"` +
		` --coverage-type cobertura` +
		` --test-file-path "${testFilePath}"` +
		` --source-file-path "${sourceFilePath}"` +
		` --model codestral/codestral-2501` +
		` --max-attempts 2` +
		` --include-files "${packageJsonPath}" "${vitestConfigPath}"`;

	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "正在生成测试...",
		cancellable: false
	}, async (progress) => {
		progress.report({ increment: 0, message: "初始化测试生成..." });

		return new Promise<void>((resolve, reject) => {
			exec(command, { cwd: workspacePath }, async (error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}

				progress.report({ increment: 50, message: "测试生成完成，正在打开文件..." });

				try {
					// 打开生成的测试文件
					const testFileUri = vscode.Uri.file(testFilePath);
					const doc = await vscode.workspace.openTextDocument(testFileUri);
					await vscode.window.showTextDocument(doc);

					// 在输出面板显示命令执行日志
					const outputChannel = vscode.window.createOutputChannel('Test Generator');
					outputChannel.appendLine(stdout);
					outputChannel.show();

					progress.report({ increment: 100, message: "完成！" });
					resolve();
				} catch (err) {
					reject(err);
				}
			});
		}).catch(err => {
			vscode.window.showErrorMessage(`生成测试失败: ${err.message}`);
		});
	});
}
export function deactivate() { }
