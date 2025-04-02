import OpenAI from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LITE_LLM_CONFIG } from './config';

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
      if (this.useBedrock) {
        // 使用 AWS Bedrock
        const command = new InvokeModelCommand({
          modelId: LITE_LLM_CONFIG.bedrock.defaultModel,
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
            model: LITE_LLM_CONFIG.openai.model,
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

  async fixESLintErrors(code: string, errors: any[]): Promise<string> {
    console.log(`\n📝 正在修复 ${errors.length} 个 ESLint 错误...`);
    console.log('\n❌ 错误详情:');
    
    const formattedErrors = errors.map((error, index) => {
      const location = `行 ${error.line}, 列 ${error.column}`;
      const ruleId = error.ruleId ? ` (${error.ruleId})` : '';
      console.log(`${index + 1}. ${error.message} - 位置: ${location}${ruleId}`);
      return `${index + 1}. ${error.message} - 位置: ${location}${ruleId}`;
    }).join('\n');

    console.log('\n📄 原始代码:');
    console.log('```typescript');
    console.log(code);
    console.log('```\n');

    const prompt = `请修复以下 TypeScript/JavaScript 代码中的 ESLint 错误。

错误列表：
${formattedErrors}

源代码：
\`\`\`typescript
${code}
\`\`\`

请按照以下要求修复代码：
1. 只返回修复后的完整代码，不要包含任何解释
2. 保持代码的功能不变
3. 确保修复所有列出的 ESLint 错误
4. 保持代码风格一致
5. 如果有未使用的变量，可以添加适当的使用场景或删除它们`;

    const fixedCode = await this.chat(prompt);
    
    console.log('\n📝 修复后的代码:');
    console.log('```typescript');
    console.log(fixedCode);
    console.log('```\n');
    
    return fixedCode;
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