import OpenAI from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LITE_LLM_CONFIG } from './config';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import * as ts from 'typescript';
import { ASTUtils } from './ast';

interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export class AiLiteLLM {
  private client: OpenAI | BedrockRuntimeClient;
  private useBedrock: boolean;

  constructor({ 
    useBedrock = false,
    bedrockCredentials 
  }: { 
    useBedrock?: boolean;
    bedrockCredentials?: BedrockCredentials;
  }) {
    this.useBedrock = useBedrock;
    
    if (useBedrock) {
      if (!bedrockCredentials?.accessKeyId || !bedrockCredentials?.secretAccessKey) {
        throw new Error('使用 AWS Bedrock 时需要提供 accessKeyId 和 secretAccessKey');
      }

      // 初始化 AWS Bedrock 客户端
      this.client = new BedrockRuntimeClient({
        region: bedrockCredentials.region || LITE_LLM_CONFIG.bedrock.defaultRegion,
        credentials: {
          accessKeyId: bedrockCredentials.accessKeyId,
          secretAccessKey: bedrockCredentials.secretAccessKey
        }
      });
    } else {
      // 从环境变量中获取 API 密钥
      const apiKey = LITE_LLM_CONFIG.openai.apiKey;
      if (!apiKey) {
        throw new Error('未设置 OPENAI_API_KEY 环境变量');
      }

      console.log('\n🔌 正在连接 OpenAI API...');
      console.log('API 地址:', LITE_LLM_CONFIG.openai.apiBase);
      console.log('模型:', LITE_LLM_CONFIG.openai.model);
      if (LITE_LLM_CONFIG.openai.proxy) {
        console.log('代理地址:', LITE_LLM_CONFIG.openai.proxy);
      }

      // 初始化 OpenAI 客户端
      const clientConfig: any = {
        apiKey,
        baseURL: LITE_LLM_CONFIG.openai.apiBase,
        timeout: 120000,
        maxRetries: 5,
        defaultHeaders: {
          'Content-Type': 'application/json'
        }
      };

      // 如果设置了代理，添加代理配置
      if (LITE_LLM_CONFIG.openai.proxy) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        clientConfig.httpAgent = new HttpsProxyAgent(LITE_LLM_CONFIG.openai.proxy);
      }

      this.client = new OpenAI(clientConfig);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      console.log('🔄 正在测试 API 连接...');
      const response = await (this.client as OpenAI).models.list();
      console.log('\n✅ API 连接成功！');
      console.log('📊 API 返回结果:');
      console.log('```json');
      console.log(JSON.stringify(response, null, 2));
      console.log('```\n');
      
      console.log('📋 可用模型列表:');
      response.data.forEach(model => {
        console.log(`- ${model.id} (${model.owned_by})`);
      });
      console.log('');
    } catch (error: any) {
      console.error('\n❌ API 连接失败！');
      if (error.response?.status) {
        console.error(`状态码: ${error.response.status}`);
        console.error('错误详情:');
        console.log('```json');
        console.log(JSON.stringify(error.response.data, null, 2));
        console.log('```\n');
        
        switch (error.response.status) {
          case 401:
            throw new Error('API 密钥无效或已过期，请检查 OPENAI_API_KEY 环境变量');
          case 403:
            throw new Error('没有权限访问 API，请检查 API 密钥和权限设置');
          case 404:
            throw new Error('API 地址无效，请检查 OPENAI_API_BASE 环境变量');
          case 429:
            throw new Error('API 请求次数超限，请稍后再试');
          default:
            throw new Error(`API 请求失败，状态码: ${error.response.status}`);
        }
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('无法连接到 OpenAI API，请检查网络连接或代理设置');
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error('OpenAI API 请求超时，请检查网络连接或增加超时时间');
      }
      throw error;
    }
  }

  async chat(content: string): Promise<string> {
    try {
      console.log('\n📤 发送给 AI 的请求内容:');
      console.log('```typescript');
      console.log(content);
      console.log('```\n');

      // 模拟 AI 响应
      return '// 模拟 AI 响应\nconst fixedCode = "test";';
    } catch (error: any) {
      console.error('\n❌ 请求失败:', error.message);
      throw error;
    }
  }

  async fixESLintErrors(sourceText: string, messages: Linter.LintMessage[]): Promise<string> {
    try {
      // 创建 TypeScript 源文件
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        sourceText,
        ts.ScriptTarget.Latest,
        true
      );

      // 按错误类型分组并获取相关代码模块
      const errorGroups = ASTUtils.groupErrorsByType(sourceFile, messages);
      let fixedText = sourceText;

      // 对每种错误类型进行处理
      for (const [ruleId, group] of errorGroups) {
        if (group.messages.length === 0) continue;
        
        console.log(`\n🔍 正在修复 ${ruleId} 类型的错误 (${group.messages.length} 个)`);
        
        // 构建提示信息
        const errorDescriptions = group.messages.map(err => 
          `- ${err.message} (规则: ${err.ruleId})`
        ).join('\n');

        const prompt = `请修复以下 TypeScript 代码中的 ESLint 错误。只返回修复后的代码，不要包含任何解释或注释。

错误信息：
${errorDescriptions}

代码上下文：
\`\`\`typescript
${group.context}
\`\`\`

请只返回修复后的代码，保持相同的缩进和格式。`;

        try {
          // 调用 AI 模型获取修复后的代码
          const response = await this.chat(prompt);
          const fixedCode = response.trim();

          // 替换所有相关节点
          for (const node of group.nodes) {
            fixedText = ASTUtils.replaceNode(fixedText, node, fixedCode);
          }

          console.log(`✅ 完成 ${ruleId} 类型错误的修复`);
        } catch (error) {
          console.error(`修复 ${ruleId} 类型错误时出错:`, error);
          // 继续处理下一组错误
          continue;
        }
      }

      return fixedText;
    } catch (error) {
      console.error('修复 ESLint 错误时出错:', error);
      return sourceText;
    }
  }

  async addTypeScriptTypes(code: string): Promise<string> {
    console.log('\n📝 正在添加 TypeScript 类型注解...');
    console.log('\n📄 原始代码:');
    console.log('```typescript');
    console.log(code);
    console.log('```\n');
    
    const prompt = `请为以下 JavaScript/TypeScript 代码添加适当的类型注解。代码：
\`\`\`typescript
${code}
\`\`\`

请只返回添加了类型注解的代码，不要包含任何解释。`;

    return this.chat(prompt);
  }
} 