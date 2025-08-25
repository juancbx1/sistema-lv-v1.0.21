// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { globSync } from 'glob';

// Encontra todos os arquivos .html dentro da pasta public
// e os prepara para o Rollup.
const htmlFiles = globSync('public/**/*.html').reduce((acc, file) => {
    // Ex: 'public/admin/home.html' -> 'admin/home'
    const name = file.replace('public/', '').replace('.html', '');
    acc[name] = resolve(__dirname, file);
    return acc;
}, {});

export default defineConfig({
  // A RAIZ DO NOSSO SITE É A PASTA 'public'.
  // O servidor de desenvolvimento vai rodar a partir daqui.
  root: 'public', 
  
  plugins: [react()],
  
  server: {
    // A página raiz agora é encontrada automaticamente.
    open: true, // Apenas abre o navegador na raiz.
    proxy: {
      // Como o servidor roda de 'public', a chamada a /api/login será
      // feita a partir de public, mas o proxy a captura corretamente.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    // O build será gerado na pasta 'dist' NA RAIZ DO PROJETO.
    // '../dist' significa "uma pasta acima da raiz (public), em um diretório chamado dist".
    outDir: '../dist',
    emptyOutDir: true,
    
    rollupOptions: {
      // Passamos todos os nossos HTMLs como pontos de entrada.
      input: htmlFiles,
    },
  },
});