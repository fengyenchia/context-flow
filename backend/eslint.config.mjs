import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
export default defineConfig([...nextCoreWebVitals, globalIgnores(['.next/**', '.next-e2e/**', '.next-build-check/**', 'src/**', 'test/**', 'api/**'])]);
