import ts from 'typescript-eslint';
export default [{ignores:['dist/**','.wrangler/**','.test-state/**','test-results/**','playwright-report/**']},...ts.configs.recommended];
