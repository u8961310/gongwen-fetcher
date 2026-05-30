import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}，請在 .env 設定`);
  return v;
}

export const config = {
  baseUrl: required('GW_BASE_URL'),
  account: required('GW_ACCOUNT'),
  password: required('GW_PASSWORD'),
  outputDir: required('GW_OUTPUT_DIR'),
  timeout: Number(process.env.GW_TIMEOUT ?? 30000),
  processedFile: process.env.GW_PROCESSED_FILE ?? 'processed.json',
};
