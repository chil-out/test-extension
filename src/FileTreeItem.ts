import * as vscode from 'vscode';
import * as path from 'path';
import { FileTreeProvider } from './FileTreeProvider';
import Parser from 'tree-sitter';

export enum FileTreeItemType {
  Folder,
  File,
  Class,   // Add new type for class
  Method
}

export class FileTreeItem extends vscode.TreeItem {
  private static lastCoverage = new Map<string, number>();

  buttons?: readonly {
    icon: vscode.ThemeIcon;
    tooltip: string;
    command: string;
    arguments?: any[];
  }[];

  constructor(
    public readonly label: string,
    public readonly type: FileTreeItemType,
    public readonly fullPath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly node?: Parser.SyntaxNode
  ) {
    super(label, collapsibleState);

    switch (type) {
      case FileTreeItemType.Folder:
        this.contextValue = 'folder';
        if (label === 'TESTABLE CODES') {
          this.iconPath = new vscode.ThemeIcon('package');
        } else {
          this.iconPath = new vscode.ThemeIcon('folder');
        }
        break;
      case FileTreeItemType.File:
        this.contextValue = 'file';
        this.iconPath = new vscode.ThemeIcon('file-code');
        // Show file extension in the label
        this.label = path.basename(fullPath);
        const absolutePath = path.normalize(fullPath);
        const fileUri = vscode.Uri.file(absolutePath);
        
        // Add command to open file when clicked
        this.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [fileUri]
        };

        // Add coverage percentage if available
        const coverage = FileTreeProvider.getFileCoverage(absolutePath);
        if (coverage !== undefined) {
          // Format coverage number with padding
          const coverageText = coverage.toString().padStart(3, ' ');
          
          // Get previous coverage for comparison
          const previousCoverage = FileTreeItem.lastCoverage.get(absolutePath);
          const coverageChanged = previousCoverage !== undefined && previousCoverage !== coverage;
          
          // Use different unicode symbols for different coverage levels
          let statusSymbol = coverage >= 80 ? '●' :  // Filled circle
                            coverage >= 50 ? '◐' :  // Half circle
                                           '○';    // Empty circle

          // Create markdown string with animation if coverage changed
          const markdownString = new vscode.MarkdownString();
          if (coverageChanged) {
            const trend = coverage > previousCoverage! ? '📈' : '📉';
            const difference = Math.abs(coverage - previousCoverage!);
            const changeColor = coverage > previousCoverage! ? '$(testing-passed-icon)' : '$(testing-failed-icon)';
            
            this.description = `${statusSymbol} ${coverageText}% ${trend}`;
            
            // Add animation class based on change
            markdownString.appendMarkdown(`**Coverage: ${coverage}%**\n\n`);
            markdownString.appendMarkdown(`${changeColor} ${coverage > previousCoverage! ? 'Increased' : 'Decreased'} by ${difference.toFixed(1)}%\n\n`);
            markdownString.appendMarkdown(coverage >= 80 ? '● Good coverage' :
                                        coverage >= 50 ? '◐ Coverage needs improvement' :
                                                       '○ Insufficient coverage');
            
            // Add custom CSS animation
            markdownString.supportHtml = true;
            markdownString.appendMarkdown(`
              <style>
                .coverage-change {
                  animation: pulse 1s ease-in-out;
                }
                @keyframes pulse {
                  0% { opacity: 0.5; }
                  50% { opacity: 1; }
                  100% { opacity: 0.5; }
                }
              </style>
              <div class="coverage-change"></div>
            `);
          } else {
            this.description = `${statusSymbol} ${coverageText}%`;
            markdownString.appendMarkdown(`**Coverage: ${coverage}%**\n\n` +
              (coverage >= 80 ? '● Good coverage' :
               coverage >= 50 ? '◐ Coverage needs improvement' :
                              '○ Insufficient coverage'));
          }

          // Update last known coverage
          FileTreeItem.lastCoverage.set(absolutePath, coverage);
          
          this.tooltip = markdownString;
        }
        
        // Configure the test generation button
        this.buttons = [{
          icon: new vscode.ThemeIcon('run'),
          tooltip: 'Generate Unit Test',
          command: 'extension.generateTests',
          arguments: [fileUri]
        }];
        break;
      case FileTreeItemType.Class:
        this.contextValue = 'class';
        this.iconPath = new vscode.ThemeIcon('symbol-class');
        break;
      case FileTreeItemType.Method:
        this.contextValue = 'method';
        if (label.startsWith('constructor')) {
          this.iconPath = new vscode.ThemeIcon('key');
        } else if (label.startsWith('_') || label.startsWith('#')) {
          this.iconPath = new vscode.ThemeIcon('lock');
        } else if (node && FileTreeProvider.isArrowFunction(node, label)) {
          this.iconPath = new vscode.ThemeIcon('private-ports-view-icon');
        } else {
          this.iconPath = new vscode.ThemeIcon('symbol-method');
        }
        this.command = command;
        break;
    }

    // Enhanced tooltips with file paths
    if (type === FileTreeItemType.Folder) {
      this.tooltip = `📁 ${fullPath}`;
    } else if (type === FileTreeItemType.File) {
      this.tooltip = `📄 ${fullPath}`;
    } else if (type === FileTreeItemType.Method) {
      const filename = path.basename(fullPath);
      this.description = filename;
      this.tooltip = `🔧 ${label} in ${filename}`;
    }
  }
}
