import * as vscode from 'vscode';
import { exec, spawn } from 'child_process';
import { TestCodeLensProvider } from './CodeLensProvider';
import { FileTreeProvider } from './FileTreeProvider';
import path from 'path';

// Create a persistent output channel
let outputChannel: vscode.OutputChannel;

// Track currently running test generation processes by file path
let activeTestGenerations: Map<string, { process: any, cancel: () => void }> = new Map();

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

	// Register TreeDataProvider
	const fileTreeProvider = new FileTreeProvider();
	const treeView = vscode.window.createTreeView('fileExplorerWithMethods', {
		treeDataProvider: fileTreeProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// Watch for coverage file changes
	const config = vscode.workspace.getConfiguration('testGenerator');
	const coveragePath = config.get<string>('coveragePath', 'coverage/coverage.xml');
	
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		const coverageWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(workspaceFolder, `**/${coveragePath}`),
			false, // Don't ignore create
			false, // Don't ignore change
			false  // Don't ignore delete
		);

		// Refresh when coverage file changes
		coverageWatcher.onDidCreate(() => {
			fileTreeProvider.refresh();
		});
		coverageWatcher.onDidChange(() => {
			fileTreeProvider.refresh();
		});
		coverageWatcher.onDidDelete(() => {
			fileTreeProvider.refresh();
		});

		context.subscriptions.push(coverageWatcher);
	}

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

	// Auto refresh when configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('testGenerator.coveragePath')) {
				// Update coverage file watcher if coverage path changes
				const newCoveragePath = vscode.workspace.getConfiguration('testGenerator').get<string>('coveragePath', 'coverage/coverage.xml');
				if (workspaceFolder) {
					const newWatcher = vscode.workspace.createFileSystemWatcher(
						new vscode.RelativePattern(workspaceFolder, `**/${newCoveragePath}`),
						false, false, false
					);
					context.subscriptions.push(newWatcher);
				}
			}
			fileTreeProvider.refresh();
		})
	);

	// Auto refresh when files change
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			// Check if the saved file is a test file
			if (document.fileName.includes('.test.') || document.fileName.includes('.spec.')) {
				outputChannel.appendLine('🔄 Test file saved, refreshing coverage data...');
				fileTreeProvider.refresh();
			}
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
}

function generateTests(targetUri: vscode.Uri) {
	if (!targetUri || !targetUri.fsPath) {
		vscode.window.showErrorMessage('Invalid file selected for test generation');
		return;
	}

	// Check if test generation is already in progress for this file
	if (activeTestGenerations.has(targetUri.fsPath)) {
		vscode.window.showInformationMessage('Test generation already in progress for this file');
		return;
	}
	
	try {
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
		const customPrompt = config.get<string>('customPrompt');

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

		// Add custom prompt if configured
		if (customPrompt) {
			command += ` --custom-prompt "${customPrompt}"`;
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
		if (customPrompt) {
			outputChannel.appendLine(`  • Custom prompt: ${customPrompt}`);
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
			cancellable: true
		}, async (progress, token) => {
			progress.report({ increment: 0, message: "Initializing test generation..." });

			return new Promise<void>((resolve, reject) => {
				// Execute the command using spawn with shell:true and the full command
				outputChannel.appendLine(`Executing command: ${command}`);
				
				const childProcess = spawn(command, [], { 
					cwd: workspacePath,
					shell: true
				});
				
				// Store process info in active generations map
				const cancelFunction = () => {
					if (childProcess && childProcess.pid) {
						// Kill the process
						try {
							// On Windows
							if (process.platform === 'win32') {
								exec(`taskkill /pid ${childProcess.pid} /T /F`);
							} else {
								// On Unix-like systems
								childProcess.kill('SIGTERM');
							}
							
							outputChannel.appendLine('\n❌ Test generation cancelled by user');
						} catch (err) {
							outputChannel.appendLine('\n⚠️ Failed to terminate process: ' + (err as Error).message);
						} finally {
							// Always remove from active generations
							activeTestGenerations.delete(targetUri.fsPath);
						}
					}
				};
				
				// Store process info in active generations map
				activeTestGenerations.set(targetUri.fsPath, {
					process: childProcess,
					cancel: cancelFunction
				});
				
				// Handle cancellation token
				token.onCancellationRequested(() => {
					cancelFunction();
					resolve(); // Resolve the promise to close the progress indicator
				});

				// Capture and display output in real-time
				let stdoutData = '';
				let stderrData = '';
				
				// Progress tracking variables
				let progressValue = 0;
				let lastReportedProgress = 0;
				const progressPatterns = [
					{ pattern: /Initializing test generation/i, value: 5 },
					{ pattern: /Analyzing source code/i, value: 15 },
					{ pattern: /Generating test cases/i, value: 30 },
					{ pattern: /Running initial tests/i, value: 50 },
					{ pattern: /Improving test coverage/i, value: 65 },
					{ pattern: /Validating test coverage/i, value: 80 },
					{ pattern: /Writing final tests/i, value: 90 }
				];

				childProcess.stdout?.on('data', (data) => {
					const output = data.toString();
					stdoutData += output;
					outputChannel.append(output);
					
					// Update progress based on output patterns
					for (const { pattern, value } of progressPatterns) {
						if (pattern.test(output) && value > progressValue) {
							progressValue = value;
							break;
						}
					}

					// Increment progress slightly on each output to show activity
					if (progressValue < 90) {
						progressValue = Math.min(90, progressValue + 0.2);
					}
					
					// Create a visual progress bar
					const progressBarWidth = 20;
					const filledChars = Math.round((progressValue / 100) * progressBarWidth);
					const progressBar = '[' + '█'.repeat(filledChars) + '░'.repeat(progressBarWidth - filledChars) + ']';
					
					// Extract the first line of output for the message
					// const firstLine = output.split('\n')[0].substring(0, 40);
					
					// Calculate increment based on difference from last reported progress
					const increment = progressValue - lastReportedProgress;
					lastReportedProgress = progressValue;
					
					// Update progress with both a visual bar and the latest output
					progress.report({ 
						increment: increment > 0 ? increment : 0,
						message: `${progressBar} (${Math.round(progressValue)}%) ...` 
					});
				});

				childProcess.stderr?.on('data', (data) => {
					const output = data.toString();
					stderrData += output;
					outputChannel.append(`⚠️ ${output}`);
				});

				childProcess.on('error', (error) => {
					outputChannel.appendLine(`\n❌ Error executing command: ${error.message}`);
					activeTestGenerations.delete(targetUri.fsPath);
					reject(error);
				});

				childProcess.on('close', async (code) => {
					// Remove from active generations when done
					activeTestGenerations.delete(targetUri.fsPath);
					
					if (code !== 0) {
						if (stderrData) {
							outputChannel.appendLine('\nError output:');
							outputChannel.appendLine(stderrData);
						}
						reject(new Error(`Process exited.`));
						return;
					}

					outputChannel.appendLine('\n📋 Command completed successfully');

					// Update progress to show completion of command execution
					progress.report({ 
						increment: 100 - lastReportedProgress,
						message: "[██████████████████████] (100%) Test generation complete!" 
					});

					try {
						// Open the generated test file
						const testFileUri = vscode.Uri.file(testFilePath);
						const doc = await vscode.workspace.openTextDocument(testFileUri);
						await vscode.window.showTextDocument(doc);

						outputChannel.appendLine('\n✅ Test generation completed successfully!');
						outputChannel.appendLine(`📄 Generated test file: ${testFilePath}`);
						
						resolve();
					} catch (err: any) {
						outputChannel.appendLine('\n❌ Error opening generated test file:');
						outputChannel.appendLine(err.message);
						reject(err);
					}
				});
			}).catch(err => {
				vscode.window.showErrorMessage(`Test generation failed: ${err.message}`);
				// Ensure we remove from active generations map even on error
				activeTestGenerations.delete(targetUri.fsPath);
			});
		});
	} catch (error: any) {
		console.error('Error in generateTests:', error);
		vscode.window.showErrorMessage(`Error in test generation: ${error?.message || 'Unknown error'}`);
		activeTestGenerations.delete(targetUri.fsPath);
	}
}

export function deactivate() { }
