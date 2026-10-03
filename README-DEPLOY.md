# NEOCHAT - Deploy

## Opcao recomendada: Render (free, sem cartao)

Render tem plano Hobby $0 com WebSockets suportados. O `render.yaml` deste
repositorio ja esta configurado (build `npm install`, start `node server.js`,
health check `/api/status`, `plan: free`).

**Botao de deploy (1 clique):**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/activistpt/neochat)

Passos manuais se preferires:
1. Cria conta em https://dashboard.render.com (GitHub OAuth mais rapido).
2. Dashboard -> New -> Blueprint -> escolhe `activistpt/neochat`.
3. O Render le o `render.yaml` commitado e cria o servico sozinho.
4. URL tera a forma `https://neochat-backend.onrender.com`.

Nota: o free tier hiberna apos ~15 min de inatividade (cold start 30-60s).

## APK Android nativa

A APK nativa esta em `android/`. Para reconstruir:

    ./android/build-apk.sh

Saida: `android/build/apk/NEOCHAT-1.0.0.apk` (assinada com debug keystore).

Para instalar: `adb install -r NEOCHAT-1.0.0.apk`
