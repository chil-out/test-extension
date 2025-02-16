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
