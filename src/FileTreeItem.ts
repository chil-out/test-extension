import * as vscode from 'vscode';

export enum FileTreeItemType {
  Folder,
  File,
  Method
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: FileTreeItemType,
    public readonly fullPath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    switch (type) {
      case FileTreeItemType.Folder:
        this.contextValue = 'folder';
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case FileTreeItemType.File:
        this.contextValue = 'file';
        this.iconPath = new vscode.ThemeIcon('file');
        this.command = command;
        break;
      case FileTreeItemType.Method:
        this.contextValue = 'method';
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        this.command = command;
        break;
    }

    // Add tooltip showing the full path for files and folders
    if (type !== FileTreeItemType.Method) {
      this.tooltip = fullPath;
    }

    // Add description for methods showing the file name
    if (type === FileTreeItemType.Method) {
      const filename = fullPath.split('/').pop() || '';
      this.description = filename;
      this.tooltip = `${label} in ${filename}`;
    }
  }
}
