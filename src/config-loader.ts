import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

export class ConfigLoader {
  private static readonly CONFIG_FILE = '.codefixrc';
  private static readonly CONFIG_FILE_JSON = '.codefixrc.json';

  public static loadConfig(): CodeFixConfig | null {
    const homeDir = os.homedir();
    const configPaths = [
      path.join(homeDir, this.CONFIG_FILE),
      path.join(homeDir, this.CONFIG_FILE_JSON)
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = configPath.endsWith('.json') 
            ? JSON.parse(content)
            : this.parseYaml(content);
          
          console.log(`📝 已加载配置文件: ${configPath}`);
          return config;
        }
      } catch (error) {
        console.warn(`⚠️ 读取配置文件 ${configPath} 失败:`, error);
      }
    }

    return null;
  }

  private static parseYaml(content: string): CodeFixConfig {
    // 简单的 YAML 解析
    const lines = content.split('\n');
    const config: CodeFixConfig = {};
    let currentSection: keyof CodeFixConfig | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;

      const sectionMatch = trimmedLine.match(/^(\w+):$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1] as keyof CodeFixConfig;
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

  public static getEnvConfig(): Record<string, string> {
    const config = this.loadConfig();
    if (!config) return {};

    const envConfig: Record<string, string> = {};

    if (config.openai) {
      envConfig.OPENAI_API_KEY = config.openai.apiKey;
      if (config.openai.apiBase) envConfig.OPENAI_API_BASE = config.openai.apiBase;
      if (config.openai.model) envConfig.OPENAI_MODEL = config.openai.model;
      if (config.openai.proxy) envConfig.OPENAI_PROXY = config.openai.proxy;
    }

    if (config.aws) {
      envConfig.AWS_ACCESS_KEY_ID = config.aws.accessKeyId;
      envConfig.AWS_SECRET_ACCESS_KEY = config.aws.secretAccessKey;
      envConfig.AWS_REGION = config.aws.region;
      if (config.aws.model) envConfig.BEDROCK_MODEL = config.aws.model;
    }

    return envConfig;
  }
} 