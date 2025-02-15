import * as vscode from 'vscode';
import * as path from 'path';

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
        // Use specific icons based on file extension
        const ext = path.extname(fullPath).toLowerCase();
        // 使用文件类型图标
        if (ext === '.ts' || ext === '.tsx') {
          this.iconPath = new vscode.ThemeIcon('symbol-file');
        } else if (ext === '.json') {
          this.iconPath = new vscode.ThemeIcon('json');
        } else if (fullPath.includes('node_modules')) {
          this.iconPath = new vscode.ThemeIcon('package');
        } else {
          this.iconPath = new vscode.ThemeIcon('file');
        }
        this.command = command;
        // Show file extension in the label
        this.label = path.basename(fullPath);
        break;
      case FileTreeItemType.Method:
        this.contextValue = 'method';
        // 使用更具体的方法符号图标
        this.iconPath = new vscode.ThemeIcon('symbol-function');
        this.command = command;
        break;
    }

    // Enhanced tooltips
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
