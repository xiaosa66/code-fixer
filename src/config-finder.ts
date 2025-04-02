import * as fs from 'fs/promises';
import * as path from 'path';
import { ESLint } from 'eslint';

export class ConfigFinder {
  private static readonly CONFIG_FILES = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml'
  ];

  /**
   * 查找最近的 ESLint 配置文件
   */
  public static async findESLintConfig(filePath: string): Promise<string | null> {
    let currentDir = path.dirname(filePath);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      for (const configFile of this.CONFIG_FILES) {
        const configPath = path.join(currentDir, configFile);
        try {
          await fs.access(configPath);
          return configPath;
        } catch {
          continue;
        }
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * 获取 ESLint 配置
   */
  public static async getESLintConfig(filePath: string): Promise<ESLint.ConfigData> {
    const configPath = await this.findESLintConfig(filePath);
    if (configPath) {
      try {
        const config = await import(configPath);
        return config.default || config;
      } catch (error) {
        console.warn(`⚠️ 读取 ESLint 配置文件失败: ${configPath}`, error);
      }
    }

    // 返回默认配置
    return {
      parser: '@typescript-eslint/parser',
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
      ],
      plugins: ['@typescript-eslint'],
      env: {
        node: true,
        es2020: true
      },
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'no-console': 'off'
      }
    };
  }

  /**
   * 获取环境变量配置
   */
  public static getEnvConfig(): Record<string, string> {
    return {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENAI_API_BASE: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      OPENAI_PROXY: process.env.OPENAI_PROXY || '',
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
      AWS_REGION: process.env.AWS_REGION || '',
      BEDROCK_MODEL: process.env.BEDROCK_MODEL || 'anthropic.claude-v2'
    };
  }

  /**
   * 检查必要的环境变量
   */
  public static checkRequiredEnvVars(useBedrock: boolean): void {
    if (useBedrock) {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
        throw new Error('使用 AWS Bedrock 需要配置 AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY 和 AWS_REGION 环境变量');
      }
    } else if (!process.env.OPENAI_API_KEY) {
      throw new Error('使用 OpenAI 需要配置 OPENAI_API_KEY 环境变量');
    }
  }
} 