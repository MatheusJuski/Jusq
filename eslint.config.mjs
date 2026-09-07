import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint do Jusq's.
 *
 * Uma config só, na raiz, com blocos por área, em vez de um `.eslintrc` por
 * pacote. O monorepo é pequeno e as regras são quase todas comuns; espalhar
 * arquivos de config só cria oportunidade de divergirem em silêncio.
 *
 * As regras são **type-aware** (`projectService`): sem os tipos, o ESLint não
 * enxerga promise não-aguardada nem `any` vindo de biblioteca, que são
 * justamente os erros que aparecem em código realtime. O custo é lint mais
 * lento e a exigência de todo arquivo pertencer a algum tsconfig.
 */
export default tseslint.config(
  {
    // Precisa ser um bloco isolado com só `ignores` para valer globalmente.
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Lê o tsconfig mais próximo de cada arquivo, sem listar projetos à mão.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promise solta em servidor realtime é bug que só aparece em produção,
      // como conexão que não fecha ou erro engolido.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Underscore marca parâmetro deliberadamente ignorado (handler de evento
      // que só usa o segundo argumento, por exemplo).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `import type` explícito: com `verbatimModuleSyntax` ligado, esquecer
      // isso arrasta o módulo inteiro para o bundle de runtime.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  /* ------------------------------------------------------------------ web */
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    ...next.configs['core-web-vitals'],
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      ...next.configs['core-web-vitals'].rules,
      // Regra do Pages Router. Sem `pages/`, ela só imprime um aviso sobre a
      // pasta que não existe, em toda execução do lint.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  /* ------------------------------------------------- server e pacotes node */
  {
    files: ['apps/server/**/*.ts', 'packages/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  /* ---------------------------------------------------------------- testes */
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // Teste monta dublê parcial de propósito; exigir tipo completo aqui
      // gera cast cerimonial que não protege nada.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  /* -------------------------------------------- arquivos de config em JS */
  {
    // Não pertencem a nenhum tsconfig; pedir tipos aqui é erro de parse.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Por último: desliga tudo que conflita com o Prettier.
  prettier,
);
