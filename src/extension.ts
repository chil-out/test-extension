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

	// 注册命令，例如 "extension.generateTests"
	let disposable = vscode.commands.registerCommand('extension.generateTests', (fileUri?: vscode.Uri) => {
		let targetUri = fileUri;

		// If no URI was passed, use the active editor
		if (!targetUri && vscode.window.activeTextEditor) {
			targetUri = vscode.window.activeTextEditor.document.uri;
		}

		if (!targetUri) {
			vscode.window.showErrorMessage('No file selected for test generation');
			return;
		}

		// Call test generation with the file URI
		generateTests(targetUri);
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
	const config = vscode.workspace.getConfiguration('testGenerator');
	const toolPath = config.get<string>('toolPath');

	if (!toolPath) {
		vscode.window.showErrorMessage('未配置测试生成工具路径');
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('没有打开任何文件');
		return;
	}

	// 获取当前工作区根目录
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('未打开工作区');
		return;
	}

	// 获取当前文件相关信息
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
