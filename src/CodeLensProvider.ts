import * as vscode from 'vscode';

export class TestCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    // Helper method to check if file is a test file
    private isTestFile(filename: string): boolean {
        const testPatterns = [
            '.test.',
            '.spec.',
            '-test.',
            '-spec.',
            '__tests__',
            '__test__',
            'vitest.config.',
            'jest.config.',
            'jest.setup.',
            'jest.teardown.',
            'karma.conf.',
            'cypress.config.',
            'cypress.json',
            'mocha.opts',
            'ava.config.',
            'jasmine.json'
        ];
        return testPatterns.some(pattern => filename.toLowerCase().includes(pattern));
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // Only provide CodeLens for JavaScript and TypeScript files that are not test files
        if (!['javascript', 'typescript'].includes(document.languageId) || 
            this.isTestFile(document.fileName)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        
        try {
            // Add CodeLens to the first line
            const firstLine = document.lineAt(0);
            const range = new vscode.Range(
                firstLine.range.start,
                firstLine.range.end
            );

            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: "📝 Generate Unit Test",
                    command: "extension.generateTests",
                    arguments: [document.uri]
                })
            );

            return codeLenses;
        } catch (err) {
            console.error('CodeLens provider error:', err);
            return [];
        }
    }

    public resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        return codeLens;
    }
}