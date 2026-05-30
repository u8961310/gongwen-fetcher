import 'dotenv/config';

export function buildConfig(env) {
  const required = (name) => {
    const v = env[name];
    if (!v) throw new Error(`缺少設定 ${name}`);
    return v;
  };
  return {
    baseUrl: required('GW_BASE_URL'),
    account: required('GW_ACCOUNT'),
    password: required('GW_PASSWORD'),
    outputDir: required('GW_OUTPUT_DIR'),
    timeout: Number(env.GW_TIMEOUT ?? 30000),
    processedFile: env.GW_PROCESSED_FILE ?? 'processed.json',
  };
}

export function loadConfigFromEnv() {
  return buildConfig(process.env);
}
