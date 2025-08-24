// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { glob } from 'glob';

// Pega todos os arquivos HTML na pasta 'public' e subpastas
const htmlFiles = glob.sync('public/**/*.html');

// Transforma a lista de caminhos em um objeto para o rollup
const input = htmlFiles.reduce((acc, file) => {
  const name = file.replace('public/', '').replace('.html', '');
  acc[name] = resolve(__dirname, file);
  return acc;
}, {});

export default defineConfig({
  // A raiz do projeto é onde o 'vite' é executado
  root: '.', 
  
  // A pasta 'public' contém assets que serão copiados para o 'dist'
  publicDir: 'public',

  plugins: [react()],
  
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