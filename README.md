# ERA · Inteligência de Calls — Frontend

Página web (estática) para enviar áudios de calls e ver a análise.
Conversa direto com o **Supabase** (transcrição via Groq Whisper + análise via
Groq Llama, feitas numa Edge Function). **Não há segredos aqui** — só a URL do
projeto e a *publishable key* (pública por design, protegida por RLS).

## Publicar (GitHub Pages)
1. Suba este repositório no GitHub.
2. Settings → Pages → Source: **Deploy from a branch** → branch `main` / `/root`.
3. O link público fica em `https://<seu-usuario>.github.io/<repo>/`.

## Configuração
No topo do `<script>` em `index.html`:
- `SUPABASE_URL` — URL do projeto Supabase.
- `SUPABASE_KEY` — publishable/anon key.
- `FUNC` — nome da Edge Function (`quick-responder`).

## Backend
O esquema do banco e a Edge Function ficam no projeto principal
(`transcritor/supabase/`).
