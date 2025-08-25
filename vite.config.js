// vite.config.js (VERSÃO FINAL CORRIGIDA)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { glob } from 'glob';

// Função para encontrar todos os arquivos HTML
const htmlFiles = glob.sync('public/**/*.html');

// Transforma a lista de caminhos em um objeto para o rollup
const input = htmlFiles.reduce((acc, file) => {
  // Cria um nome curto para cada entrada, ex: 'admin/embalagem-de-produtos'
  const name = file.replace('public/', '').replace('.html', '');
  acc[name] = resolve(__dirname, file);
  return acc;
}, {});

export default defineConfig({
  // A raiz do projeto é o diretório atual
  root: '.', 
  
  // A pasta 'public' contém assets que serão simplesmente copiados para o 'dist'
  publicDir: 'public',

  plugins: [react()],
  
  server: {
    // Abre o navegador na página de login ao iniciar o dev server
    open: '/login.html',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  // ======================================================
  //  CONFIGURAÇÃO DE BUILD UNIFICADA E CORRIGIDA
  // ======================================================
  build: {
    // Gera os arquivos de build na pasta 'dist' na raiz do projeto
    outDir: 'dist',
    // Limpa a pasta 'dist' antes de cada build
    emptyOutDir: true,
    
    // Opções avançadas para o Rollup (o "empacotador" que o Vite usa)
    rollupOptions: {
      // Diz ao Vite para processar todos os HTMLs que encontramos
      input,
    },
  },
});