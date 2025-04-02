import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ESLint } from 'eslint';
import { log } from 'console';

export interface CodeFixConfig {
  openai?: {
    apiKey: string;
    apiBase?: string;
    model?: string;
    proxy?: string;
  };
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    model?: string;
  };
}

export class ConfigFinder {
  private static readonly CONFIG_FILES = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml'
  ];

  private static readonly CODE_FIX_CONFIG_FILES = [
    '.codefixrc',
    '.codefixrc.json'
  ];

  private static codeFixConfig: CodeFixConfig | null = null;

  /**
   * 加载 .codefixrc 配置
   */
  private static async loadCodeFixConfig(): Promise<CodeFixConfig | null> {
    if (this.codeFixConfig) {
      return this.codeFixConfig;
    }

    const homeDir = os.homedir();
    for (const configFile of this.CODE_FIX_CONFIG_FILES) {
      const configPath = path.join(homeDir, configFile);
      try {
        if (await fs.access(configPath).then(() => true).catch(() => false)) {
          const content = await fs.readFile(configPath, 'utf-8');
          const config = configFile.endsWith('.json')
            ? JSON.parse(content)
            : this.parseYaml(content);

          console.log(`📝 已加载配置文件: ${configPath}: ${
            JSON.stringify(config, null, 2)
          }`);
          this.codeFixConfig = config;
          return config;
        }
      } catch (error) {
        console.warn(`⚠️ 读取配置文件 ${configPath} 失败:`, error);
      }
    }

    return null;
  }

  private static parseYaml(content: string): ESLint.ConfigData {
    const lines = content.split('\n');
    const config: ESLint.ConfigData = {};
    let currentSection: keyof ESLint.ConfigData | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;

      const sectionMatch = trimmedLine.match(/^(\w+):$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1] as keyof ESLint.ConfigData;
        config[currentSection] = {} as any;
        continue;
      }

      if (currentSection) {
        const [key, value] = trimmedLine.split(':').map(s => s.trim());
        if (key && value) {
          (config[currentSection] as any)[key] = value;
        }
      }
    }

    return config;
  }

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
    console.log(`📝 已加载eslint文件: ${configPath}`);
    // 延迟 1 秒
    await new Promise(resolve => setTimeout(resolve, 1000));


    if (configPath) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        let config: ESLint.ConfigData;

        if (configPath.endsWith('.json')) {
          config = JSON.parse(content);
        } else if (configPath.endsWith('.js') || configPath.endsWith('.cjs')) {
          // 使用 require 读取 .js 或 .cjs 文件
          const importedConfig = require(configPath);
          config = importedConfig.default || importedConfig;
        } else {
          // 对于 .yaml 或 .yml 文件，使用简单的解析
          const yamlConfig = this.parseYaml(content);
          config = {
            parser: yamlConfig.parser,
            extends: yamlConfig.extends,
            plugins: yamlConfig.plugins,
            env: yamlConfig.env,
            rules: yamlConfig.rules
          };
        }

        return config;
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
  public static async getEnvConfig(): Promise<Record<string, string>> {
    const config = await this.loadCodeFixConfig();
    if (!config) {
      // 报错
      throw new Error('未找到 .codefixrc 文件');
    }

    return {
      OPENAI_API_KEY: config.openai?.apiKey || '',
      OPENAI_API_BASE: config.openai?.apiBase || 'https://api.openai.com/v1',
      OPENAI_MODEL: config.openai?.model || 'gpt-3.5-turbo',
      OPENAI_PROXY: config.openai?.proxy || '',
      AWS_ACCESS_KEY_ID: config.aws?.accessKeyId || '',
      AWS_SECRET_ACCESS_KEY: config.aws?.secretAccessKey || '',
      AWS_REGION: config.aws?.region || '',
      BEDROCK_MODEL: config.aws?.model || 'anthropic.claude-v2'
    };
  }

  /**
   * 检查必要的环境变量
   */
  public static async checkRequiredEnvVars(useBedrock: boolean): Promise<void> {

    const envConfig = await this.getEnvConfig();

    if (envConfig.OPENAI_API_KEY) {
      // 写入到process.env
      process.env.OPENAI_API_KEY = envConfig.OPENAI_API_KEY;
      process.env.OPENAI_API_BASE = envConfig.OPENAI_API_BASE;
      process.env.OPENAI_MODEL = envConfig.OPENAI_MODEL;

      console.log('✅ 已加载 envConfig', envConfig);
    }

    if (useBedrock) {
      if (!envConfig.AWS_ACCESS_KEY_ID || !envConfig.AWS_SECRET_ACCESS_KEY || !envConfig.AWS_REGION) {
        throw new Error('使用 AWS Bedrock 需要配置 AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY 和 AWS_REGION');
      }
    } else if (!envConfig.OPENAI_API_KEY) {
      throw new Error('使用 OpenAI 需要配置 OPENAI_API_KEY');
    }
  }
} 