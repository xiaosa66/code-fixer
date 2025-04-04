import OpenAI from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
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
        region: bedrockCredentials.region || process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: bedrockCredentials.accessKeyId,
          secretAccessKey: bedrockCredentials.secretAccessKey
        }
      });
    } else {
      // 从环境变量中获取 API 密钥
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error(`未设置 OPENAI_API_KEY 环境变量 ${apiKey}` );
      }

      console.log('\n🔌 正在连接 OpenAI API...');
      console.log('API 地址:', process.env.OPENAI_API_BASE);
      console.log('模型:', process.env.OPENAI_MODEL);
      if (process.env.OPENAI_PROXY) {
        console.log('代理地址:',process.env.OPENAI_PROXY);
      }

      // 初始化 OpenAI 客户端
      const clientConfig: any = {
        apiKey,
        baseURL: process.env.OPENAI_API_BASE,
        timeout: 120000,
        maxRetries: 5,
        defaultHeaders: {
          'Content-Type': 'application/json'
        }
      };

      // 如果设置了代理，添加代理配置
      if (process.env.OPENAI_PROXY) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        clientConfig.httpAgent = new HttpsProxyAgent(process.env.OPENAI_PROXY);
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
      if (this.useBedrock) {
        // 使用 AWS Bedrock
        const command = new InvokeModelCommand({
          modelId: process.env.BEDROCK_MODEL || 'anthropic.claude-v2',
          body: JSON.stringify({
            prompt: content,
            max_tokens: 500,
            temperature: 0.4
          })
        });

        try {
          process.stdout.write('🤖 AI 正在思考...');
          const response = await (this.client as BedrockRuntimeClient).send(command);
          const responseBody = JSON.parse(new TextDecoder().decode(response.body));
          process.stdout.write(' ✓\n');
          return responseBody.completion?.trim() || '';
        } catch (error: any) {
          process.stdout.write(' ✗\n');
          if (error.name === 'CredentialsProviderError') {
            throw new Error('AWS 凭证无效或已过期，请检查 accessKeyId 和 secretAccessKey');
          }
          if (error.name === 'TimeoutError') {
            throw new Error('AWS Bedrock 服务请求超时，请检查网络连接或增加超时时间');
          }
          if (error.name === 'NetworkingError') {
            throw new Error('无法连接到 AWS Bedrock 服务，请检查网络连接或代理设置');
          }
          throw error;
        }
      } else {
        // 使用 OpenAI
        try {
          // 先测试连接
          await this.testConnection();
          
          console.log('\n🔄 正在发送请求到 OpenAI API...');
          console.log('📤 请求内容:', content);
          
          const startTime = Date.now();
          const response = await (this.client as OpenAI).chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: '你是一个专业的代码修复助手，擅长修复 ESLint 错误和添加 TypeScript 类型注解。'
              },
              {
                role: 'user',
                content: content
              }
            ],
            max_tokens: 2000,
            temperature: 0.2,
            top_p: 0.95,
            frequency_penalty: 0.5,
            presence_penalty: 0.5
          });

          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000;
          
          console.log(`\n✅ 请求成功 (耗时: ${duration.toFixed(1)}秒)`);
          console.log('📥 API 返回结果:');
          console.log('```typescript');
          const result = response.choices[0].message.content?.trim() || '';
          console.log(result);
          console.log('```\n');
          
          return result;
        } catch (error: any) {
          console.error('\n❌ OpenAI API 调用失败');
          console.error('调用地址', process.env.OPENAI_API_BASE);
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
              case 500:
                throw new Error('OpenAI 服务器内部错误，请稍后再试');
              case 503:
                throw new Error('OpenAI 服务暂时不可用，请稍后再试');
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
    } catch (error: any) {
      console.error('\n❌ AI 调用失败');
      console.error('错误类型:', error.name);
      console.error('错误消息:', error.message);
      if (error.stack) {
        console.error('错误堆栈:', error.stack);
      }
      throw error;
    }
  }

  async fixESLintErrors(errorSnippets: Array<{
    message: string;
    ruleId?: string;
    code: string;
    context: string;
    line: number;
    column: number;
    sourceText?: string;  // 添加源文件文本
  }>): Promise<string> {
    // 为每个错误单独获取修复结果
    const fixedLines = await Promise.all(errorSnippets.map(async (snippet) => {
      const errorDescription = 
        `错误位置: 第${snippet.line}行, 第${snippet.column}列\n` +
        `规则ID: ${snippet.ruleId || '未知'}\n` +
        `错误信息: ${snippet.message}\n` +
        `上下文代码:\n${snippet.context}\n` +
        `需要修改的代码行:\n${snippet.code}`;

      const prompt = `请修复以下ESLint错误。注意：你只需要返回修改后的那一行代码，不要返回上下文代码。\n\n${errorDescription}\n\n` +
        `请直接返回修复后的代码行，不要包含任何 markdown 格式标记，也不要包含解释或其他内容。`;

      let response: string;
      if (this.useBedrock) {
        // AWS Bedrock 实现
        const command = new InvokeModelCommand({
          modelId: process.env.BEDROCK_MODEL || 'anthropic.claude-v2',
          body: JSON.stringify({
            prompt: prompt,
            max_tokens: 2000,
            temperature: 0.2
          })
        });
        const bedrockResponse = await (this.client as BedrockRuntimeClient).send(command);
        response = new TextDecoder().decode(bedrockResponse.body);
      } else {
        // OpenAI 实现
        const openaiResponse = await (this.client as OpenAI).chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '你是一个专业的代码修复助手，擅长修复 ESLint 错误。请只返回修复后的那一行代码，不要返回上下文代码，不要包含任何 markdown 格式标记，也不要包含解释或其他内容。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2
        });
        response = openaiResponse.choices[0]?.message?.content || '';
      }

      // 处理 markdown 格式
      response = response.replace(/^```(typescript)?\n/, '').replace(/\n```$/, '').trim();

      // 打印代码对比
      console.log(`\n📝 第 ${snippet.line} 行代码修复对比:`);
      console.log('\n原始代码:');
      console.log('```typescript');
      console.log(snippet.code);
      console.log('```\n');
      
      console.log('修复后代码:');
      console.log('```typescript');
      console.log(response);
      console.log('```\n');

      return {
        line: snippet.line,
        fixedCode: response
      };
    }));

    // 按行号排序
    fixedLines.sort((a, b) => a.line - b.line);

    // 获取源文件的所有行
    const sourceLines = errorSnippets[0].sourceText?.split('\n') || [];
    const fixedLineNumbers = new Set(fixedLines.map(f => f.line));

    // 构建修复后的代码
    let fixedCode = '';
    
    // 遍历所有行，对错误行进行替换
    for (let i = 0; i < sourceLines.length; i++) {
      const lineNumber = i + 1;  // 1-based line number
      if (fixedLineNumbers.has(lineNumber)) {
        // 如果是错误行，使用修复后的代码
        const fixedLine = fixedLines.find(f => f.line === lineNumber);
        fixedCode += fixedLine?.fixedCode + '\n';
      } else {
        // 如果不是错误行，保留原始代码
        fixedCode += sourceLines[i] + '\n';
      }
    }

    return fixedCode;
  }

  async addTypeScriptTypes(code: string): Promise<string> {
    console.log('\n📝 正在添加 TypeScript 类型注解...');
    console.log('\n📄 原始代码:');
    console.log('```typescript');
    console.log(code);
    console.log('```\n');
  
    // 使用 TypeScript 解析源代码
    const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);
  
    // 自定义实现：查找缺少返回类型注解的函数节点
    type NodeInfo = {
      range: { start: number; end: number };
      snippet: string;
      line: number;
    };
    const nodesNeedingAnnotation: NodeInfo[] = [];
  
    function visit(node: ts.Node) {
      // 这里示例只处理函数声明、函数表达式和箭头函数，且要求没有返回类型注解
      if (
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
        !node.type
      ) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const snippet = code.substring(start, end);
        const { line } = sourceFile.getLineAndCharacterOfPosition(start);
        nodesNeedingAnnotation.push({ range: { start, end }, snippet, line: line + 1 });
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  
    if (nodesNeedingAnnotation.length === 0) {
      console.log('✅ 没有发现需要添加类型注解的模块');
      return code;
    }
  
    console.log(`\n📊 发现 ${nodesNeedingAnnotation.length} 个模块需要添加类型注解`);
  
    // 对每个需要添加类型注解的模块，调用 AI 单独修复
    const fixedNodes = await Promise.all(nodesNeedingAnnotation.map(async (nodeInfo) => {
      const prompt = `请为以下代码添加适当的 TypeScript 类型注解。请只返回添加了类型注解的代码，不要包含任何解释或上下文。\n\n代码：\n\`\`\`typescript\n${nodeInfo.snippet}\n\`\`\``;
      let fixedSnippet = await this.chat(prompt);
      // 移除可能存在的 Markdown 代码块标记，并去除首尾空白
      fixedSnippet = fixedSnippet.replace(/^```(typescript)?\n/, '').replace(/\n```$/, '').trim();
  
      console.log(`\n📝 第 ${nodeInfo.line} 行代码模块修复对比:`);
      console.log('\n原始代码:');
      console.log('```typescript');
      console.log(nodeInfo.snippet);
      console.log('```\n');
      console.log('修复后代码:');
      console.log('```typescript');
      console.log(fixedSnippet);
      console.log('```\n');
  
      return {
        range: nodeInfo.range,
        fixedSnippet
      };
    }));
  
    // 为避免替换过程中影响后续节点的索引，按 range.start 倒序替换
    fixedNodes.sort((a, b) => b.range.start - a.range.start);
  
    let fixedCode = code;
    for (const { range, fixedSnippet } of fixedNodes) {
      fixedCode = fixedCode.slice(0, range.start) + fixedSnippet + fixedCode.slice(range.end);
    }
  
    return fixedCode;
  }
}