# Cuidando do Lar — IPVSP

Site do ministério **Cuidando do Lar** da Igreja Pão da Vida – São Paulo.

Permite gerenciar:

- **Escala** dos cuidadores a cada domingo (com destaque para o próximo culto).
- **Estoque** de itens da igreja, separados em *Material de limpeza* e *Comes & bebes*, com observações.

Os dados são sincronizados em tempo real via Supabase, então qualquer colaborador vê as alterações imediatamente.

---

## Setup (≈ 5 minutos)

### 1. Crie um projeto no Supabase

1. Vá em https://supabase.com/dashboard e clique em **New project**.
2. Dê um nome (ex.: `ipvsp-lar`), escolha região (use São Paulo / South America), defina uma senha de banco e crie.
3. Aguarde o projeto provisionar.

### 2. Rode o SQL

1. No projeto Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase-setup.sql`](supabase-setup.sql) e clique em **Run**.
3. Você verá `Success. No rows returned`.

### 3. Configure as chaves no site

1. Em **Project Settings → API** copie:
   - **Project URL**
   - **anon public** key
2. Edite `config.js` e cole:

```js
export const SUPABASE_URL = "https://SEUPROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "eyJh......";
```

Pronto. Abra o `index.html` no navegador (ou suba no GitHub Pages — abaixo).

---

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Cuidando do Lar — primeira versão"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/ipvsp-lar.git
git push -u origin main
```

Depois, no GitHub: **Settings → Pages → Source: `main` / `(root)`**.
O site fica em `https://SEU_USUARIO.github.io/ipvsp-lar/`.

---

## Estrutura

```
.
├── index.html              # estrutura
├── styles.css              # design (paleta, layout, modais)
├── app.js                  # lógica + Supabase + Realtime
├── config.js               # URL + anon key (preencha aqui)
├── supabase-setup.sql      # SQL para criar tabelas + policies
├── assets/
│   ├── logo.svg
│   └── logo-mark.svg
└── README.md
```

## Tecnologias

- HTML/CSS/JS puros — zero build, zero dependência.
- [Supabase](https://supabase.com) (Postgres + Realtime).
- Tipografia: [Fraunces](https://fonts.google.com/specimen/Fraunces) + [Inter](https://fonts.google.com/specimen/Inter).

## Modo offline

Se `config.js` não estiver preenchido, o site funciona em modo local (dados ficam só no navegador via `localStorage`). Útil para testar.

---

> *"Tudo o que fizerem, façam de todo o coração, como para o Senhor."*
> Colossenses 3:23
