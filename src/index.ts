#!/usr/bin/env node
'use strict';

import 'dotenv/config';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { ESLint } from 'eslint';
import type { ESLint as ESLintType, Linter } from 'eslint';
import * as ts from 'typescript';
import { program } from 'commander';
import inquirer from 'inquirer';
import loading from 'loading-cli';
import { AiLiteLLM } from './ai';
import { ConfigFinder } from './config-finder';
import { ConfigLoader } from './config-loader';
import { LITE_LLM_CONFIG } from './config';

interface FixOptions {
  eslint: boolean;
  typescript: boolean;
  files?: string[];
  ai?: boolean;
  secretKey?: string;
  useBedrock?: boolean;
  bedrockAccessKeyId?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
}

// 配置常量
const CONFIG = {
  eslint: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    ignorePatterns: ['node_modules', 'dist', 'build']
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    }
  }
};

// 获取项目根目录
function getProjectRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch (error) {
    return process.cwd();
  }
}

// 获取所有需要处理的文件
async function getFilesToProcess(options: FixOptions): Promise<string[]> {
  const rootDir = getProjectRoot();
  const files: string[] = [];

  // 如果指定了文件，直接使用指定的文件
  if (options.files && options.files.length > 0) {
    console.log('指定了以下文件:', options.files);
    for (const file of options.files) {
      const fullPath = path.resolve(rootDir, file);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          const ext = path.extname(fullPath);
          if (options.eslint && CONFIG.eslint.extensions.includes(ext)) {
            files.push(fullPath);
          }
          if (options.typescript && CONFIG.typescript.extensions.includes(ext)) {
            files.push(fullPath);
          }
        } else if (stat.isDirectory()) {
          // 如果是目录，扫描该目录下的文件
          await scanDirectory(fullPath);
        }
      } catch (error: any) {
        console.warn(`警告: 无法访问文件 ${file}:`, error.message);
      }
    }
    console.log('找到以下文件:', files);
    return files;
  }

  // 如果没有指定文件，扫描整个项目
  async function scanDirectory(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!CONFIG.eslint.ignorePatterns.some(pattern => fullPath.includes(pattern))) {
          await scanDirectory(fullPath);
        }
      } else {
        const ext = path.extname(entry.name);
        if (options.eslint && CONFIG.eslint.extensions.includes(ext)) {
          files.push(fullPath);
        }
        if (options.typescript && CONFIG.typescript.extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDirectory(rootDir);
  console.log('找到以下文件:', files);
  return files;
}

// 修复 ESLint 错误
async function fixESLintErrors(files: string[], useAI: boolean = false, useBedrock: boolean = false) {
  try {
    // 检查必要的环境变量
    const envConfig = ConfigLoader.getEnvConfig();
    if (useBedrock) {
      if (!envConfig.AWS_ACCESS_KEY_ID || !envConfig.AWS_SECRET_ACCESS_KEY || !envConfig.AWS_REGION) {
        throw new Error('使用 AWS Bedrock 需要配置 AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY 和 AWS_REGION 环境变量');
      }
    } else if (useAI && !envConfig.OPENAI_API_KEY) {
      throw new Error('使用 OpenAI 需要配置 OPENAI_API_KEY 环境变量');
    }

    // 获取第一个文件的 ESLint 配置
    const eslintConfig = await ConfigFinder.getESLintConfig(files[0]);

    // 初始化 ESLint
    const eslint = new ESLint({
      overrideConfig: {
        ...eslintConfig,
        plugins: eslintConfig.plugins ? {
          '@typescript-eslint': require('@typescript-eslint/eslint-plugin')
        } : undefined
      },
      fix: false,
      cwd: path.dirname(files[0])
    });

    // 运行 ESLint 检查
    console.log('\n🔍 正在检查文件...');
    const results = await eslint.lintFiles(files);

    // 过滤出有错误的文件
    const filesWithErrors = results.filter(result => result.errorCount > 0);
    if (filesWithErrors.length === 0) {
      console.log('✅ 没有发现 ESLint 错误');
      return;
    }

    console.log(`\n📊 发现 ${filesWithErrors.length} 个文件需要修复`);
    console.log(filesWithErrors.map(result => result.filePath));

    // 初始化 AI 客户端
    let aiClient: AiLiteLLM | null = null;
    if (useAI) {
      console.log('\n🤖 初始化 AI 客户端...');
      
      if (useBedrock) {
        aiClient = new AiLiteLLM({
          useBedrock: true,
          bedrockCredentials: {
            accessKeyId: envConfig.AWS_ACCESS_KEY_ID!,
            secretAccessKey: envConfig.AWS_SECRET_ACCESS_KEY!,
            region: envConfig.AWS_REGION
          }
        });
      } else {
        aiClient = new AiLiteLLM({});
      }
    }

    // 修复错误
    for (const result of filesWithErrors) {
      if (result.errorCount > 0) {
        const fileName = path.basename(result.filePath);
        console.log(`\n📄 正在处理文件: ${fileName}`);
        console.log(`发现 ${result.errorCount} 个错误，${result.warningCount} 个警告`);

        try {
          const sourceText = await fs.readFile(result.filePath, 'utf-8');
          let fixedCode: string;

          if (aiClient) {
            fixedCode = await aiClient.fixESLintErrors(sourceText, result.messages);
          } else {
            // 使用 ESLint 的自动修复
            const fixedResults = await ESLint.outputFixes([result]);
            fixedCode = await fs.readFile(result.filePath, 'utf-8');
          }

          await fs.writeFile(result.filePath, fixedCode, 'utf-8');
          console.log(`✅ 文件 ${fileName} 修复完成`);
        } catch (error: any) {
          console.error(`❌ 文件 ${fileName} 修复失败:`, error.message);
          continue;
        }
      }
    }

    console.log('\n✨ ESLint 修复完成!');
  } catch (error: any) {
    console.error('\n❌ 修复失败:', error.message);
    process.exit(1);
  }
}

// 为 TypeScript 代码添加类型信息
async function addTypeScriptTypes(files: string[], aiClient?: AiLiteLLM): Promise<void> {
  const load = loading('正在添加 TypeScript 类型信息...').start();
  
  try {
    console.log(`\n🔍 正在处理 ${files.length} 个文件...`);
    for (const file of files) {
      const fileName = path.basename(file);
      load.text = `正在处理文件: ${fileName}`;
      console.log(`\n📄 正在处理文件: ${fileName}`);
      const sourceText = await fs.readFile(file, 'utf-8');
      
      if (aiClient) {
        // 使用 AI 添加类型
        load.text = `正在使用 AI 为 ${fileName} 添加类型注解...`;
        const fixedCode = await aiClient.addTypeScriptTypes(sourceText);
        await fs.writeFile(file, fixedCode, 'utf-8');
        console.log(`✅ 文件 ${fileName} 处理完成`);
      } else {
        // 使用原有的 TypeScript 编译器添加类型
        load.text = `正在使用 TypeScript 编译器为 ${fileName} 添加类型注解...`;
        const sourceFile = ts.createSourceFile(
          file,
          sourceText,
          ts.ScriptTarget.Latest,
          true
        );

        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
        const transformer = (context: ts.TransformationContext) => {
          const visit = (node: ts.Node): ts.Node => {
            // 为函数参数添加类型
            if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
              const params = node.parameters.map(param => {
                if (!param.type) {
                  return ts.factory.createParameterDeclaration(
                    param.modifiers,
                    param.dotDotDotToken,
                    param.name,
                    param.questionToken,
                    ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                    param.initializer
                  );
                }
                return param;
              });

              if (ts.isFunctionDeclaration(node)) {
                return ts.factory.createFunctionDeclaration(
                  node.modifiers,
                  node.asteriskToken,
                  node.name,
                  node.typeParameters,
                  params,
                  node.type || ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                  node.body
                );
              } else {
                return ts.factory.createMethodDeclaration(
                  node.modifiers,
                  node.asteriskToken,
                  node.name,
                  node.questionToken,
                  node.typeParameters,
                  params,
                  node.type || ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                  node.body
                );
              }
            }

            // 为变量声明添加类型
            if (ts.isVariableDeclaration(node) && !node.type) {
              return ts.factory.createVariableDeclaration(
                node.name,
                node.exclamationToken,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                node.initializer
              );
            }

            // 为属性声明添加类型
            if (ts.isPropertyDeclaration(node) && !node.type) {
              return ts.factory.createPropertyDeclaration(
                node.modifiers,
                node.name,
                node.questionToken || node.exclamationToken,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                node.initializer
              );
            }

            return ts.visitEachChild(node, visit, context);
          };

          return (node: ts.SourceFile) => ts.visitNode(node, visit) as ts.SourceFile;
        };

        const result = ts.transform(sourceFile, [transformer]);
        const newText = printer.printFile(result.transformed[0] as ts.SourceFile);
        
        if (newText !== sourceText) {
          await fs.writeFile(file, newText, 'utf-8');
          console.log(`✅ 文件 ${fileName} 处理完成`);
        } else {
          console.log(`ℹ️ 文件 ${fileName} 无需修改`);
        }
      }
    }
    
    load.succeed('TypeScript 类型添加完成!');
  } catch (error) {
    load.fail('TypeScript 类型添加失败');
    throw error;
  }
}

// 主函数
async function main() {
  program
    .version('1.0.0')
    .option('-e, --eslint', '修复 ESLint 错误')
    .option('-t, --typescript', '添加 TypeScript 类型')
    .option('--ai', '使用 AI 辅助修复')
    .option('--use-bedrock', '使用 AWS Bedrock')
    .option('--bedrock-access-key-id <key>', 'AWS Bedrock Access Key ID')
    .option('--bedrock-secret-key <key>', 'AWS Bedrock Secret Key')
    .option('--bedrock-region <region>', 'AWS Bedrock Region')
    .arguments('[files...]')
    .parse();

  const options = program.opts<FixOptions>();
  options.files = program.args;

  if (!options.eslint && !options.typescript) {
    console.error('❌ 请至少指定一个操作：--eslint 或 --typescript');
    process.exit(1);
  }

  // 检查环境变量
  if (options.ai && !process.env.OPENAI_API_KEY) {
    console.error('❌ 使用 AI 功能时需要设置 OPENAI_API_KEY 环境变量');
    process.exit(1);
  }

  try {
    const files = options.files || await getFilesToProcess(options);
    
    if (files.length === 0) {
      console.log('没有找到需要处理的文件');
      return;
    }

    if (options.eslint) {
      try {
        await fixESLintErrors(files, options.ai, options.useBedrock);
      } catch (error: any) {
        console.error('\n❌ ESLint 修复失败:');
        console.error(error.message);
        process.exit(1);
      }
    }

    if (options.typescript) {
      try {
        await addTypeScriptTypes(files, options.ai ? new AiLiteLLM({}) : undefined);
      } catch (error: any) {
        console.error('\n❌ TypeScript 类型添加失败:');
        console.error(error.message);
        process.exit(1);
      }
    }

    console.log('\n✨ 代码修复完成!');
  } catch (error: any) {
    console.error('\n❌ 发生错误:');
    console.error(error.message);
    process.exit(1);
  }
}

main(); 