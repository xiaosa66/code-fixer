export const LITE_LLM_CONFIG = {
  // OpenAI 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    proxy: process.env.OPENAI_PROXY || undefined
  },
  // AWS Bedrock 配置
  bedrock: {
    // Bedrock 服务端点
    endpoints: {
      'us-east-1': 'bedrock-runtime.us-east-1.amazonaws.com',
      'us-west-2': 'bedrock-runtime.us-west-2.amazonaws.com',
      'ap-southeast-1': 'bedrock-runtime.ap-southeast-1.amazonaws.com'
    },
    // 默认区域
    defaultRegion: process.env.AWS_REGION || 'us-east-1',
    // 支持的模型
    models: {
      claude: 'anthropic.claude-v2',
      llama2: 'meta.llama2-13b-chat',
      titan: 'amazon.titan-text-lite-v1'
    },
    // 默认模型
    defaultModel: process.env.BEDROCK_MODEL || 'anthropic.claude-v2'
  }
}; 