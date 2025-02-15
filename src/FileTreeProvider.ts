import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Parser from 'tree-sitter';
import * as JavaScript from 'tree-sitter-javascript';
const TypeScript = require('tree-sitter-typescript');

import { FileTreeItem, FileTreeItemType } from './FileTreeItem';

interface MethodGroup {
  className: string;
  methods: Parser.SyntaxNode[];
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | void> = new vscode.EventEmitter<FileTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | void> = this._onDidChangeTreeData.event;
  private jsParser: Parser;
  private tsParser: Parser;

  // Add static method to detect arrow functions
  public static isArrowFunction(node: Parser.SyntaxNode, label: string): boolean {
    // Check if the node itself is an arrow function
    if (node.type === 'arrow_function') {
      return true;
    }

    // Check if it's a variable declaration containing an arrow function
    if (node.type === 'variable_declaration') {
      const arrowFuncs = node.descendantsOfType('arrow_function');
      if (arrowFuncs.length > 0) {
        return true;
      }
    }

    // Check if it's an assignment with arrow function
    if (node.type === 'assignment_expression') {
      const arrowFuncs = node.descendantsOfType('arrow_function');
      if (arrowFuncs.length > 0) {
        return true;
      }
    }

    // Check the label for arrow function indicators
    return label.includes('=>') ||
      label.includes('callback');
  }

  constructor() {
    // 初始化解析器
    this.jsParser = new Parser();
    this.tsParser = new Parser();
    this.jsParser.setLanguage(JavaScript);
    this.tsParser.setLanguage(TypeScript.typescript);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    // 如果没有传入元素，返回顶层"TESTABLE CODES"目录
    if (!element) {
      return [
        new FileTreeItem(
          'TESTABLE CODES',
          FileTreeItemType.Folder,
          'testable_codes_root',  // 使用特殊标识符
          vscode.TreeItemCollapsibleState.Expanded
        )
      ];
    }

    // 如果是顶层"TESTABLE CODES"目录，返回项目文件夹
    if (element.fullPath === 'testable_codes_root') {
      const projectName = this.getProjectName(rootPath);
      return [
        new FileTreeItem(
          projectName,
          FileTreeItemType.Folder,
          rootPath,
          vscode.TreeItemCollapsibleState.Expanded
        )
      ];
    }

    // 如果是项目根文件夹，返回其内容
    if (element.fullPath === rootPath) {
      return this.getFileItems(rootPath);
    }

    // 如果是文件夹，返回其内容
    if (element.type === FileTreeItemType.Folder) {
      return this.getFileItems(element.fullPath);
    }

    // 处理其他情况
    if (element.type === FileTreeItemType.File) {
      return this.getClassGroups(element.fullPath);
    } else if (element.type === FileTreeItemType.Class) {
      return this.getMethodsForClass(element.fullPath, element.label);
    }

    return [];
  }

  private getProjectName(rootPath: string): string {
    // 获取项目名称（使用目录名）
    const parts = rootPath.split('/');
    return parts[parts.length - 1] || 'Project';
  }

  // Add helper method to check if file is a test file or config file
  private isTestFile(filename: string): boolean {
    const testPatterns = [
      // Test files
      '.test.',
      '.spec.',
      '-test.',
      '-spec.',
      '__tests__',
      '__test__',
      // Test framework configs
      'vitest.config.',
      'jest.config.',
      'jest.setup.',
      'jest.teardown.',
      'karma.conf.',
      'cypress.config.',
      'cypress.json',
      'mocha.opts',
      'ava.config.',
      'jasmine.json',
      // Tool configs
      '.eslintrc.',
      '.prettierrc.',
      '.babelrc.',
      'tsconfig.',
      'webpack.config.',
      'rollup.config.',
      'vite.config.',
      'postcss.config.',
      'tailwind.config.',
      '.stylelintrc',
      'nodemon.json',
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml'
    ];
    return testPatterns.some(pattern => filename.toLowerCase().includes(pattern));
  }

  // 递归获取目录下的文件和文件夹
  private getFileItems(dirPath: string): FileTreeItem[] {
    if (!fs.existsSync(dirPath) || dirPath.includes('node_modules')) {
      return [];
    }

    const entries = fs.readdirSync(dirPath);
    const items: FileTreeItem[] = [];

    entries.forEach(entry => {
      if (entry === 'node_modules' || this.isTestFile(entry)) {
        return;
      }

      const fullPath = path.join(dirPath, entry);
      const stats = fs.statSync(fullPath);
      const ext = path.extname(entry).toLowerCase();

      if (stats.isDirectory()) {
        // 递归获取子目录的内容
        const subItems = this.getFileItems(fullPath);
        if (subItems.length > 0) {
          items.push(new FileTreeItem(
            entry,
            FileTreeItemType.Folder,
            fullPath,
            vscode.TreeItemCollapsibleState.Collapsed
          ));
        }
      } else if (stats.isFile()) {
        const isJsTs = ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx';
        if (isJsTs && !this.isTestFile(fullPath)) {
          const absolutePath = path.resolve(fullPath);
          items.push(new FileTreeItem(
            entry,
            FileTreeItemType.File,
            path.normalize(absolutePath),
            vscode.TreeItemCollapsibleState.Collapsed
          ));
        }
      }
    });

    return items;
  }

  // 检查目录中是否包含 JavaScript 或 TypeScript 文件
  private directoryContainsJsOrTs(dirPath: string): boolean {
    try {
      // 排除 node_modules 目录
      if (dirPath.includes('node_modules') || this.isTestFile(dirPath)) {
        return false;
      }

      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        // 跳过 node_modules 目录
        if (entry === 'node_modules' || this.isTestFile(entry)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          if (this.directoryContainsJsOrTs(fullPath)) {
            return true;
          }
        } else if (stats.isFile()) {
          const ext = path.extname(entry).toLowerCase();
          if ((ext === '.js' || ext === '.ts') && !this.isTestFile(entry)) {
            return true;
          }
        }
      }
    } catch (error) {
      console.error('Error checking directory:', error);
    }
    return false;
  }

  // 利用 tree-sitter 解析文件内容，提取方法名（这里以 function 声明为示例）
  private async getMethodsFromFile(filePath: string): Promise<FileTreeItem[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();

      const parser = ext === '.ts' ? this.tsParser : this.jsParser;
      const tree = parser.parse(content);

      const nodeTypes = [
        'function_declaration',      // 函数声明
        'method_definition',         // 类方法
        'arrow_function',            // 箭头函数
        'variable_declaration'       // 变量声明（可能包含函数）
      ];

      const methodNodes: Parser.SyntaxNode[] = [];
      const processedNodes = new Set<string>(); // 用于跟踪已处理的节点

      this.traverse(tree.rootNode, node => {
        if (nodeTypes.includes(node.type)) {
          // 生成唯一标识
          const nodeId = `${node.startPosition.row}-${node.startPosition.column}`;

          if (processedNodes.has(nodeId)) {
            return;
          }

          if (node.type === 'variable_declaration') {
            // 检查变量声明中的箭头函数
            const declarations = node.descendantsOfType('arrow_function');
            if (declarations.length > 0) {
              // 添加变量声明本身
              methodNodes.push(node);
              // 标记为已处理
              processedNodes.add(nodeId);
            }
          } else {
            // 处理其他类型的函数声明
            methodNodes.push(node);
            processedNodes.add(nodeId);

            // 检查内部的箭头函数
            const arrowFunctions = node.descendantsOfType('arrow_function');
            arrowFunctions.forEach(arrowFunc => {
              const arrowId = `${arrowFunc.startPosition.row}-${arrowFunc.startPosition.column}`;
              if (!processedNodes.has(arrowId)) {
                methodNodes.push(arrowFunc);
                processedNodes.add(arrowId);
              }
            });
          }
        }
      });

      return methodNodes.map(node => {
        let label = '';
        let parentName = '';

        if (node.type === 'function_declaration') {
          label = node.childForFieldName('name')?.text || '<anonymous>';
        } else if (node.type === 'method_definition') {
          label = node.childForFieldName('name')?.text || '<anonymous>';
        } else if (node.type === 'variable_declaration') {
          const declarator = node.descendantsOfType('variable_declarator')[0];
          label = declarator?.childForFieldName('name')?.text || '<anonymous>';
        } else if (node.type === 'arrow_function') {
          // 获取箭头函数的上下文
          const parent = node.parent;
          if (parent?.type === 'variable_declarator') {
            label = parent.childForFieldName('name')?.text || '<anonymous>';
          } else if (parent?.type === 'assignment_expression') {
            const left = parent.childForFieldName('left');
            if (left?.type === 'member_expression') {
              // 处理对象方法，如 obj.method = () => {}
              const property = left.childForFieldName('property')?.text;
              const object = left.childForFieldName('object')?.text;
              label = object ? `${object}.${property}` : property || '<anonymous>';
            } else {
              label = left?.text || '<anonymous>';
            }
          } else if (parent?.type === 'property_definition') {
            // 处理类属性
            label = parent.childForFieldName('name')?.text || '<anonymous>';
          } else if (parent?.type === 'pair' || parent?.type === 'object_property') {
            // 处理对象字面量属性
            label = parent.childForFieldName('key')?.text || '<anonymous>';
          } else if (parent?.type === 'arguments') {
            // 处理回调函数
            const grandParent = parent.parent;
            if (grandParent?.type === 'call_expression') {
              const callee = grandParent.childForFieldName('function')?.text;
              const argIndex = Array.from(parent.children).indexOf(node);
              label = `${callee || ''} callback[${argIndex}]`;
            } else {
              label = 'callback';
            }
          } else {
            // 获取函数所在行的内容作为标识
            const lineContent = content.split('\n')[node.startPosition.row].trim();
            label = `λ ${lineContent.substring(0, 30)}${lineContent.length > 30 ? '...' : ''}`;
          }
        }

        return new FileTreeItem(
          label,
          FileTreeItemType.Method,
          filePath,
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'vscode.open',
            title: 'Go to Method',
            arguments: [
              vscode.Uri.file(filePath),
              {
                selection: new vscode.Range(
                  new vscode.Position(node.startPosition.row, node.startPosition.column),
                  new vscode.Position(node.endPosition.row, node.endPosition.column)
                )
              }
            ]
          },
          node
        );
      });
    } catch (error) {
      console.error('Error parsing file:', error);
      return [];
    }
  }

  private async getClassGroups(filePath: string): Promise<FileTreeItem[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      const parser = ext === '.ts' ? this.tsParser : this.jsParser;
      const tree = parser.parse(content);

      // Group methods by class
      const classGroups: Map<string, Parser.SyntaxNode[]> = new Map();
      const defaultGroup: Parser.SyntaxNode[] = [];

      // Find all class declarations
      const classNodes = tree.rootNode.descendantsOfType('class_declaration');
      classNodes.forEach(classNode => {
        const className = classNode.childForFieldName('name')?.text || 'Anonymous Class';
        classGroups.set(className, []);

        // Get all methods in this class
        const methods = classNode.descendantsOfType('method_definition');
        methods.forEach(method => {
          classGroups.get(className)?.push(method);
        });
      });

      // Handle standalone functions and methods
      this.findMethods(tree.rootNode).forEach(node => {
        if (!this.isMethodInClass(node)) {
          defaultGroup.push(node);
        }
      });

      // Create tree items
      const items: FileTreeItem[] = [];

      // Add class groups
      classGroups.forEach((methods, className) => {
        if (methods.length > 0) {
          items.push(new FileTreeItem(
            className,
            FileTreeItemType.Class,
            filePath,
            vscode.TreeItemCollapsibleState.Expanded
          ));
        }
      });

      // Add default group if it has items
      if (defaultGroup.length > 0) {
        items.push(new FileTreeItem(
          'Global Scope',
          FileTreeItemType.Class,
          filePath,
          vscode.TreeItemCollapsibleState.Expanded
        ));
      }

      return items;
    } catch (error) {
      console.error('Error parsing file:', error);
      return [];
    }
  }

  private async getMethodsForClass(filePath: string, className: string): Promise<FileTreeItem[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const parser = ext === '.ts' ? this.tsParser : this.jsParser;
    const tree = parser.parse(content);

    let methods: Parser.SyntaxNode[] = [];

    if (className === 'Global Scope') {
      // Get standalone functions
      methods = this.findMethods(tree.rootNode).filter(node => !this.isMethodInClass(node));
    } else {
      // Get class methods
      const classNode = tree.rootNode.descendantsOfType('class_declaration')
        .find(node => node.childForFieldName('name')?.text === className);

      if (classNode) {
        methods = classNode.descendantsOfType('method_definition');
      }
    }

    return methods.map(node => this.createMethodTreeItem(node, filePath));
  }

  private isMethodInClass(node: Parser.SyntaxNode): boolean {
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'class_declaration') {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  private createMethodTreeItem(node: Parser.SyntaxNode, filePath: string): FileTreeItem {
    let label = '';
    if (node.type === 'function_declaration') {
      label = node.childForFieldName('name')?.text || '<anonymous>';
    } else if (node.type === 'method_definition') {
      label = node.childForFieldName('name')?.text || '<anonymous>';
    } else if (node.type === 'arrow_function') {
      const parent = node.parent;
      if (parent?.type === 'variable_declarator') {
        label = parent.childForFieldName('name')?.text || '<anonymous>';
      } else if (parent?.type === 'assignment_expression') {
        const left = parent.childForFieldName('left');
        label = left?.text || '<anonymous>';
      }
    }
    return new FileTreeItem(
      label,
      FileTreeItemType.Method,
      filePath,
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'vscode.open',
        title: 'Go to Method',
        arguments: [
          vscode.Uri.file(filePath),
          {
            selection: new vscode.Range(
              new vscode.Position(node.startPosition.row, node.startPosition.column),
              new vscode.Position(node.endPosition.row, node.endPosition.column)
            )
          }
        ]
      },
      node
    );
  }

  // 简单递归遍历 AST 节点
  private traverse(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void) {
    callback(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverse(child, callback);
      }
    }
  }

  private findMethods(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const methods: Parser.SyntaxNode[] = [];
    this.traverse(node, (n) => {
      if (n.type === 'function_declaration' || n.type === 'method_definition' || n.type === 'arrow_function') {
        methods.push(n);
      }
    });
    return methods;
  }
}
