import * as ts from 'typescript';
import type { Linter } from 'eslint';

export class ASTUtils {
  /**
   * 根据 ESLint 错误信息获取相关的代码模块
   */
  static getErrorNode(sourceFile: ts.SourceFile, message: Linter.LintMessage): ts.Node | null {
    try {
      const { line, column } = message;
      const position = ts.getPositionOfLineAndCharacter(sourceFile, line - 1, column - 1);
      
      let result: ts.Node | null = null;
      
      function visit(node: ts.Node) {
        if (result) return;
        
        const nodeStart = node.getStart();
        const nodeEnd = node.getEnd();
        if (position >= nodeStart && position <= nodeEnd) {
          result = node;
        }
        
        ts.forEachChild(node, visit);
      }
      
      visit(sourceFile);
      return result;
    } catch (error) {
      console.error(`获取错误节点时出错 (行 ${message.line}, 列 ${message.column}):`, error);
      return null;
    }
  }

  /**
   * 获取节点的完整代码文本，包括其上下文
   */
  static getNodeTextWithContext(sourceText: string, node: ts.Node, contextLines: number = 3): string {
    try {
      const lines = sourceText.split('\n');
      const nodeStart = node.getStart();
      const nodeEnd = node.getEnd();
      
      // 获取节点所在的行号
      const startLine = ts.getLineAndCharacterOfPosition(node.getSourceFile(), nodeStart).line;
      const endLine = ts.getLineAndCharacterOfPosition(node.getSourceFile(), nodeEnd).line;
      
      // 计算上下文的起始和结束行
      const contextStartLine = Math.max(0, startLine - contextLines);
      const contextEndLine = Math.min(lines.length - 1, endLine + contextLines);
      
      // 返回上下文代码
      return lines.slice(contextStartLine, contextEndLine + 1).join('\n');
    } catch (error) {
      console.error('获取节点上下文时出错:', error);
      return node.getText();
    }
  }

  /**
   * 按错误类型对错误进行分组，并获取相关的代码模块
   */
  static groupErrorsByType(sourceFile: ts.SourceFile, messages: Linter.LintMessage[]): Map<string, {
    messages: Linter.LintMessage[];
    nodes: ts.Node[];
    context: string;
  }> {
    const groups = new Map<string, {
      messages: Linter.LintMessage[];
      nodes: ts.Node[];
      context: string;
    }>();

    for (const message of messages) {
      const ruleId = message.ruleId || 'unknown';
      const node = this.getErrorNode(sourceFile, message);
      
      if (!node) continue;

      const group = groups.get(ruleId) || {
        messages: [],
        nodes: [],
        context: ''
      };

      group.messages.push(message);
      group.nodes.push(node);
      
      // 使用最大的上下文
      const nodeContext = this.getNodeTextWithContext(sourceFile.text, node);
      if (nodeContext.length > (group.context.length || 0)) {
        group.context = nodeContext;
      }

      groups.set(ruleId, group);
    }

    return groups;
  }

  /**
   * 替换源代码中的节点
   */
  static replaceNode(sourceText: string, node: ts.Node, newText: string): string {
    try {
      const nodeStart = node.getStart();
      const nodeEnd = node.getEnd();
      return sourceText.substring(0, nodeStart) + newText + sourceText.substring(nodeEnd);
    } catch (error) {
      console.error('替换节点时出错:', error);
      return sourceText;
    }
  }
} 