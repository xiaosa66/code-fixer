# Code Fixer

一个智能的代码修复工具，可以自动修复 ESLint 错误并为 TypeScript 代码添加类型信息。

## 功能特点

- 自动修复 ESLint 错误
- 为 TypeScript 代码添加类型信息
- 支持 AI 辅助修复（使用 OpenAI 或 AWS Bedrock）
- 自动查找和使用项目的 ESLint 配置
- 支持自定义配置

## 安装

```bash
npm install -g code-fixer
```

## 使用方法

### 基本用法

```bash
# 修复 ESLint 错误
code-fixer --eslint

# 添加 TypeScript 类型
code-fixer --typescript

# 同时执行两个操作
code-fixer --eslint --typescript
```

### 使用 AI 辅助修复

```bash
# 使用 OpenAI
code-fixer --eslint --ai

# 使用 AWS Bedrock
code-fixer --eslint --ai --use-bedrock
```

### 指定文件

```bash
# 修复特定文件
code-fixer --eslint src/index.ts src/utils.ts

# 修复特定目录下的所有文件
code-fixer --eslint src/
```

## 配置文件

Code Fixer 支持通过用户根目录下的配置文件来设置 API 密钥和其他选项。支持 JSON (`.codefixrc.json`)。

### 配置文件位置

配置文件应该放在用户根目录下：

- `~/.codefixrc.json` (JSON 格式)

### 配置示例

JSON 格式 (`.codefixrc.json`):
```json
{
  "openai": {
    "apiKey": "你的OpenAI API密钥",
    "apiBase": "https://api.openai.com/v1",
    "model": "gpt-3.5-turbo",
    "proxy": "http://127.0.0.1:7890"
  },
  "aws": {
    "accessKeyId": "你的AWS访问密钥ID",
    "secretAccessKey": "你的AWS秘密访问密钥",
    "region": "us-east-1",
    "model": "anthropic.claude-v2"
  }
}
```

### 配置项说明

#### OpenAI 配置
- `apiKey`: OpenAI API 密钥（必需）
- `apiBase`: API 基础地址（可选）
- `model`: 使用的模型名称（可选）
- `proxy`: 代理服务器地址（可选）

#### AWS Bedrock 配置
- `accessKeyId`: AWS 访问密钥 ID（必需）
- `secretAccessKey`: AWS 秘密访问密钥（必需）
- `region`: AWS 区域（必需）
- `model`: Bedrock 模型名称（可选）

### 注意事项

1. 配置文件包含敏感信息，请确保文件权限设置正确（建议设置为 600）
2. 如果同时存在 `.codefixrc` 和 `.codefixrc.json`，优先使用 `.codefixrc`
3. 使用 AWS Bedrock 时需要配置所有必需的 AWS 凭证
4. 使用 OpenAI 时需要配置 API 密钥

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test
```

## 许可证

MIT 