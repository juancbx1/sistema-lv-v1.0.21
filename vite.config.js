// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  // A raiz do nosso site é a pasta 'public'
  root: 'public',
  
  plugins: [react()],
  
  server: {
    // A página inicial que o Vite vai tentar abrir
    open: '/index.html',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    // O build será gerado na pasta 'dist' na raiz do projeto
    outDir: '../dist',
    emptyOutDir: true,
    
    rollupOptions: {
      // Definimos manualmente os HTMLs que são pontos de entrada
      input: {
        main: resolve(__dirname, 'public/index.html'),
        home: resolve(__dirname, 'public/admin/home.html'),
        embalagem: resolve(__dirname, 'public/admin/embalagem-de-produtos.html'),
        acessoNegado: resolve(__dirname, 'public/admin/acesso-negado.html'),
        arremates: resolve(__dirname, 'public/admin/arremates.html'),
        cadastrarProduto: resolve(__dirname, 'public/admin/cadastrar-produto.html'),
        cadastrarUsuario: resolve(__dirname, 'public/admin/cadastrar-usuario.html'),
        MenuLateral: resolve(__dirname, 'public/admin/menu-lateral.html'),
        // Adicione outros HTMLs aqui conforme precisar
      },
    },
  },
});