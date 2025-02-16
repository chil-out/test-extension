import * as vscode from 'vscode';
import { exec } from 'child_process';
import { TestCodeLensProvider } from './CodeLensProvider';
import { FileTreeProvider } from './FileTreeProvider';

// Create a persistent output channel
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	// Initialize the output channel
	outputChannel = vscode.window.createOutputChannel('Test Generator');
	context.subscriptions.push(outputChannel);

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

	// Register TreeDataProvider
	const fileTreeProvider = new FileTreeProvider();
	const treeView = vscode.window.createTreeView('fileExplorerWithMethods', {
		treeDataProvider: fileTreeProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// Register refresh command
	let disposableRefresh = vscode.commands.registerCommand('extension.refreshFileTree', () => {
		fileTreeProvider.refresh();
	});
	context.subscriptions.push(disposableRefresh);

	// Auto refresh tree view when configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			fileTreeProvider.refresh();
		})
	);

	// Auto refresh when files change
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => {
			fileTreeProvider.refresh();
		}),
		vscode.workspace.onDidCreateFiles(() => {
			fileTreeProvider.refresh();
		}),
		vscode.workspace.onDidDeleteFiles(() => {
			fileTreeProvider.refresh();
		}),
		vscode.workspace.onDidRenameFiles(() => {
			fileTreeProvider.refresh();
		})
	);
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

	// Clear previous output and show the channel
	outputChannel.clear();
	outputChannel.show(true);  // true means preserve focus
	outputChannel.appendLine('🚀 Starting test generation...');
	outputChannel.appendLine(`📂 Source file: ${sourceFilePath}`);
	outputChannel.appendLine(`📝 Test file: ${testFilePath}`);
	outputChannel.appendLine('\n🔄 Executing command...\n');

	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Generating tests...",
		cancellable: false
	}, async (progress) => {
		progress.report({ increment: 0, message: "Initializing test generation..." });

		return new Promise<void>((resolve, reject) => {
			exec(command, { cwd: workspacePath }, async (error, stdout, stderr) => {
				if (error) {
					outputChannel.appendLine('\n❌ Error executing command:');
					outputChannel.appendLine(error.message);
					if (stderr) {
						outputChannel.appendLine('\nError output:');
						outputChannel.appendLine(stderr);
					}
					reject(error);
					return;
				}

				if (stderr) {
					outputChannel.appendLine('\n⚠️ Warning output:');
					outputChannel.appendLine(stderr);
				}

				outputChannel.appendLine('\n📋 Command output:');
				outputChannel.appendLine(stdout);

				progress.report({ increment: 50, message: "Test generation complete, opening file..." });

				try {
					// Open the generated test file
					const testFileUri = vscode.Uri.file(testFilePath);
					const doc = await vscode.workspace.openTextDocument(testFileUri);
					await vscode.window.showTextDocument(doc);

					outputChannel.appendLine('\n✅ Test generation completed successfully!');
					outputChannel.appendLine(`📄 Generated test file: ${testFilePath}`);

					progress.report({ increment: 100, message: "Done!" });
					resolve();
				} catch (err: any) {
					outputChannel.appendLine('\n❌ Error opening generated test file:');
					outputChannel.appendLine(err.message);
					reject(err);
				}
			});
		}).catch(err => {
			vscode.window.showErrorMessage(`Test generation failed: ${err.message}`);
		});
	});
}

export function deactivate() { }
