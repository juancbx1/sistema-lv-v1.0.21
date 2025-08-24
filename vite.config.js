// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: 'public', 
  
  plugins: [react()],
  
  server: {
    // Isso é crucial. Quando o Vite rodar no localhost, qualquer chamada
    // para /api/alguma-coisa será redirecionada para o seu backend
    // que está rodando via 'vercel dev' (ou diretamente no seu server.js).
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Assumindo que seu backend roda na porta 3000
        changeOrigin: true,
      },
    },
  },
  
  build: {
    // Diz ao Vite para gerar os arquivos de build fora da pasta 'public'
    // para não criar um loop (ex: /public/dist). Vamos gerar na raiz do projeto.
    outDir: '../dist', 
    emptyOutDir: true, // Limpa o diretório 'dist' a cada build
    
    rollupOptions: {
      input: {
        // Mapeamos aqui cada página HTML que queremos que o Vite gerencie.
        embalagem: resolve(__dirname, 'public/admin/embalagem-de-produtos.html'),
        // Adicione outras páginas aqui conforme for migrando.
        // dashboardCostureira: resolve(__dirname, 'public/dashboard/dashboard.html'),
      },
    },
  },
});