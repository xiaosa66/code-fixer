import * as fs from 'fs';
import * as path from 'path';
import type { Linter } from 'eslint';

export class ConfigFinder {
  /**
   * 查找最近的 ESLint 配置文件
   */
  static async findESLintConfig(filePath: string): Promise<string | null> {
    const configFiles = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc'
    ];

    let currentDir = path.dirname(filePath);
    const rootDir = path.parse(process.cwd()).root;

    while (currentDir !== rootDir) {
      for (const configFile of configFiles) {
        const configPath = path.join(currentDir, configFile);
        if (fs.existsSync(configPath)) {
          return configPath;
        }
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * 获取 ESLint 配置
   */
  static async getESLintConfig(filePath: string): Promise<Linter.Config> {
    // 1. 查找配置文件
    const configPath = await this.findESLintConfig(filePath);
    if (configPath) {
      console.log(`📄 使用 ESLint 配置文件: ${configPath}`);
      return require(configPath);
    }

    // 2. 使用默认配置
    console.log('📄 使用默认 ESLint 配置');
    return {
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        'eqeqeq': 'error',
        'no-var': 'error',
        'semi': 'error'
      }
    };
  }

  /**
   * 获取环境变量配置
   */
  static getEnvConfig(): Record<string, string> {
    const envConfig: Record<string, string> = {};
    
    // OpenAI 配置
    if (process.env.OPENAI_API_KEY) {
      envConfig.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    if (process.env.OPENAI_API_BASE) {
      envConfig.OPENAI_API_BASE = process.env.OPENAI_API_BASE;
    }
    if (process.env.OPENAI_MODEL) {
      envConfig.OPENAI_MODEL = process.env.OPENAI_MODEL;
    }
    if (process.env.OPENAI_PROXY) {
      envConfig.OPENAI_PROXY = process.env.OPENAI_PROXY;
    }

    // AWS Bedrock 配置
    if (process.env.AWS_ACCESS_KEY_ID) {
      envConfig.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    }
    if (process.env.AWS_SECRET_ACCESS_KEY) {
      envConfig.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
    }
    if (process.env.AWS_REGION) {
      envConfig.AWS_REGION = process.env.AWS_REGION;
    }
    if (process.env.BEDROCK_MODEL) {
      envConfig.BEDROCK_MODEL = process.env.BEDROCK_MODEL;
    }

    return envConfig;
  }

  /**
   * 检查必要的环境变量
   */
  static checkRequiredEnvVars(useBedrock: boolean = false): void {
    if (useBedrock) {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('使用 AWS Bedrock 时需要设置 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY 环境变量');
      }
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('需要设置 OPENAI_API_KEY 环境变量');
      }
    }
  }
} 