// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { glob } from 'glob';

const htmlFiles = glob.sync('public/**/*.html');
const input = htmlFiles.reduce((acc, file) => {
  const name = file.replace('public/', '').replace('.html', '');
  acc[name] = resolve(__dirname, file);
  return acc;
}, {});

export default defineConfig({
  root: '.',
  publicDir: 'public', // Continua copiando assets como imagens
  plugins: [react()],
  build: {
    outDir: 'dist', // O build vai para a pasta 'dist' na raiz
    emptyOutDir: true,
    rollupOptions: {
      input,
    },
  },
  
  server: {
    // Abre o navegador na página de login ao iniciar
    open: '/login.html',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    // Gera os arquivos de build na pasta 'dist' na raiz do projeto
    outDir: 'dist',
    emptyOutDir: true,
    
    rollupOptions: {
      // Diz ao Vite para processar todos os HTMLs encontrados
      input,
    },
  },
});