# Comece aqui — Cuidando do Lar

Site do ministério **Cuidando do Lar** da IPVSP.

## Em 1 comando

Abra o **PowerShell** dentro desta pasta (clique com botão direito no Explorer → "Abrir no Terminal" ou "PowerShell aqui") e rode:

```powershell
.\setup.ps1
```

O script faz **tudo automaticamente**:

- Cria projeto no Supabase (região São Paulo)
- Cria as tabelas (`escalas`, `estoque`) com policies e Realtime
- Pega URL e chave anon, escreve no `config.js`
- Cria o repositório no GitHub
- Faz `git push`
- Ativa o GitHub Pages
- Imprime a URL final do site

> Tempo total: ~3 minutos (a maior parte é o Supabase provisionando o banco).

## Se der algum erro

Cada passo é independente. Se um falhar, o script te diz exatamente o quê e você pode rodar de novo — ele detecta o que já foi feito e pula.

## Atualizar o site depois

Edite os arquivos, depois:

```powershell
git add .
git commit -m "ajustes"
git push
```

O Pages atualiza sozinho em ~30 segundos.

## Trocar o logo

Substitua `assets/logo-mark.svg` (versão circular) e `assets/logo.svg` (versão completa). As cores usam `currentColor`, então adaptam ao tema.

---

Para detalhes técnicos, veja [`README.md`](README.md).
