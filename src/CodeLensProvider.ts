import * as vscode from 'vscode';

export class TestCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // 只为 JavaScript 和 TypeScript 文件提供 CodeLens
        if (!['javascript', 'typescript'].includes(document.languageId)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        
        try {
            // 在文件第一行添加 CodeLens
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