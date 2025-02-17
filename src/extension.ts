import * as vscode from 'vscode';
import { exec } from 'child_process';
import { TestCodeLensProvider } from './CodeLensProvider';
import { FileTreeProvider } from './FileTreeProvider';
import path from 'path';

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

	// Register configuration command
	let disposableConfig = vscode.commands.registerCommand('extension.openTestConfig', () => {
		const { ConfigurationView } = require('./ConfigurationView');
		ConfigurationView.createOrShow(context.extensionUri);
	});
	context.subscriptions.push(disposableConfig);

	// Register refresh command
	let disposableRefresh = vscode.commands.registerCommand('extension.refreshCoverage', () => {
		outputChannel.appendLine('🔄 Refreshing coverage data...');
		fileTreeProvider.refresh();
		outputChannel.appendLine('✅ Coverage data refreshed');
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

	// Clear previous output and show the channel first
	outputChannel.clear();
	outputChannel.show(true);  // true means preserve focus

	// Get configuration
	const config = vscode.workspace.getConfiguration('testGenerator');
	const toolPath = config.get<string>('toolPath');
	const model = config.get<string>('model');
	const maxAttempts = config.get<number>('maxAttempts');
	const coverageThreshold = config.get<number>('coverageThreshold', 95);
	const testCommand = config.get<string>('testCommand');
	const coverageType = config.get<string>('coverageType');
	const testFileExtension = config.get<string>('testFileExtension');

	// Check coverage first
	const coverage = FileTreeProvider.getFileCoverage(targetUri.fsPath);
	if (coverage !== undefined && coverage >= coverageThreshold) {
		const message = `⚠️ Test generation skipped:\n` +
			`Current file already has ${coverage}% coverage, which is above the threshold (${coverageThreshold}%).\n` +
			`No additional tests needed.`;
		outputChannel.appendLine(message);
		vscode.window.showInformationMessage(`Current file already has ${coverage}% coverage, which is above the threshold (${coverageThreshold}%). No additional tests needed.`);
		return;
	}

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
	const testFilePath = `${fileNameWithoutExt}${testFileExtension}`;

	// 构建相对于工作区的路径
	const workspacePath = workspaceFolder.uri.fsPath;
	const coveragePath = path.join(workspacePath, config.get('coveragePath', 'coverage/coverage.xml'));
	const includeFiles = (config.get<string[]>('includeFiles') || ['package.json', 'vitest.config.js'])
		.map(file => path.join(workspacePath, file));
	const apiBase = config.get<string>('apiBase');

	let command = `"${toolPath}" gen` +
		` --test-command "${testCommand}"` +
		` --code-coverage-report-path "${coveragePath}"` +
		` --coverage-type ${coverageType}` +
		` --test-file-path "${testFilePath}"` +
		` --source-file-path "${sourceFilePath}"` +
		` --model ${model}` +
		` --max-attempts ${maxAttempts}`;

	// Add API base if configured
	if (apiBase) {
		command += ` --api-base "${apiBase}"`;
	}

	// Add include files
	if (includeFiles.length > 0) {
		command += ` --include-files ${includeFiles.map(f => `"${f}"`).join(' ')}`;
	}

	outputChannel.appendLine('🚀 Starting test generation...');
	outputChannel.appendLine('📋 Configuration:');
	outputChannel.appendLine(`  • Model: ${model}`);
	outputChannel.appendLine(`  • Max attempts: ${maxAttempts}`);
	outputChannel.appendLine(`  • Coverage threshold: ${coverageThreshold}%`);
	outputChannel.appendLine(`  • Test command: ${testCommand}`);
	outputChannel.appendLine(`  • Coverage type: ${coverageType}`);
	outputChannel.appendLine(`  • Coverage path: ${coveragePath}`);
	if (apiBase) {
		outputChannel.appendLine(`  • API base: ${apiBase}`);
	}
	outputChannel.appendLine(`  • Include files: ${includeFiles.join(', ')}`);
	if (coverage !== undefined) {
		outputChannel.appendLine(`📊 Current coverage: ${coverage}%`);
	}
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
