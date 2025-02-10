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

    // Add icon for files only
    if (type === FileTreeItemType.File) {
      this.contextValue = 'file'; // This enables context menu items
      this.iconPath = new vscode.ThemeIcon('file');
      // Add the test generation button in the tree item
      this.command = command;
    }
  }
}
