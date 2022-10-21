module.exports = {
    env: {
        browser: true,
        es2021: true
    },
    extends: [
        'standard'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 13,
        sourceType: 'module'
    },
    plugins: [
        '@typescript-eslint'
    ],
    rules: {
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': ['error'],
        'no-console': 'warn',
        'no-debugger': 'warn',
        'import/prefer-default-export': 0,
        indent: ['error', 4],
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single'],
        semi: ['warn', 'never'],
        'import/no-extraneous-dependencies': 'off',
        'no-param-reassign': [2, {props: false}],
        'object-curly-spacing': 'off',
        'comma-dangle': 'off',
        'max-len': ['warn', {code: 200, ignoreComments: true}],
        'arrow-body-style': ['error', 'as-needed', { requireReturnForObjectLiteral: false }],
        'class-methods-use-this': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/max-attributes-per-line': 'off',
        'no-underscore-dangle': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'vue/no-v-html': 'off',
        'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
        'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
        'max-classes-per-file': 'off'
    },
}
