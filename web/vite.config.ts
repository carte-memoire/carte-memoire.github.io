import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Politique de sécurité du contenu (CSP), ajoutée uniquement au site publié :
// le navigateur refuse alors tout script, style ou connexion qui ne vient pas
// du site lui-même ou de Supabase. C'est la principale protection contre le
// vol de session par injection de code (XSS).
// (Pas en développement : le rechargement à chaud de Vite a besoin de scripts en ligne.)
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const realtime = supabaseUrl.replace(/^https:/, 'wss:');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${supabaseUrl}`,
    `connect-src 'self' ${supabaseUrl} ${realtime}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    server: { port: 5173, strictPort: true },
    build: {
      rolldownOptions: {
        output: {
          // Bibliothèques à part : elles changent rarement, le navigateur les garde
          // en cache d'une mise à jour du site à l'autre
          advancedChunks: {
            groups: [
              { name: 'supabase', test: /node_modules[\\/]@supabase/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
