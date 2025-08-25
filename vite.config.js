// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { globSync } from 'glob'; // Usar globSync é mais simples

// Encontra todos os arquivos .html dentro da pasta public e subpastas
const htmlFiles = globSync('public/**/*.html').reduce((acc, file) => {
    // Cria um nome amigável para a entrada, ex: 'admin/home'
    const name = file.replace('public/', '').replace('.html', '');
    acc[name] = resolve(__dirname, file);
    return acc;
}, {});

export default defineConfig({
  root: '.', 
  publicDir: 'public',
  // ...
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: htmlFiles, // Usa o objeto que criamos automaticamente
    },
  },
  // ...
});