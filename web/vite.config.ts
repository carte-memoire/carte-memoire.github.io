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
  // VITE_… (fichiers .env) et PORT (variable d'environnement, lue aussi par loadEnv)
  const env = loadEnv(mode, '.', ['VITE_', 'PORT']);
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    // 5173 par défaut (adresse autorisée pour les liens reçus par e-mail) ; un autre port
    // si PORT est fourni (deux serveurs de développement en même temps)
    server: { port: Number(env.PORT) || 5173, strictPort: true },
    build: {
      // Les polices restent des fichiers à part : intégrées au code (data:), la politique de
      // sécurité (font-src 'self') les bloquerait sur le site publié
      assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
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
