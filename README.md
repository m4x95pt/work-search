# 📦 Job Scanner — Coimbra

Corre todos os dias de manhã e manda uma notificação para o Slack com vagas novas de **armazém, logística e entregas** em Coimbra.

## Como funciona

- Vai ao **Indeed PT** e **Net-Empregos** e procura vagas recentes (últimos 7 dias)
- Filtra por palavras-chave relevantes (armazém, entregador, transportadora, etc.)
- Remove duplicados
- Manda um resumo para o Slack via Incoming Webhook

## Setup

### 1. Criar o Slack Webhook

1. Vai a [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Ativa **Incoming Webhooks** → **Add New Webhook to Workspace**
3. Escolhe o canal (ex: `#empregos`) → copia o Webhook URL

### 2. Adicionar o secret no GitHub

No teu repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|------|-------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` |

### 3. Fazer push do código

```bash
git init
git add .
git commit -m "feat: job scraper Coimbra"
git remote add origin https://github.com/SEU_USER/job-scanner-coimbra.git
git push -u origin main
```

O GitHub Actions vai correr automaticamente todos os dias às **09:00 hora de Lisboa**.

### Correr manualmente

Vai ao separador **Actions** no GitHub → **📦 Job Scanner — Coimbra** → **Run workflow**.

## Personalizar

Edita o ficheiro `scraper.js` para ajustar:

- **`SEARCHES`** — os termos de pesquisa
- **`KEYWORDS_GOOD`** — palavras que tornam uma vaga relevante
- **`KEYWORDS_BAD`** — palavras que filtram vagas não relevantes
- **Cron schedule** — no ficheiro `.github/workflows/job-scanner.yml`

## Exemplo de notificação Slack

```
📦 Job Scanner — 3 vaga(s) nova(s) em Coimbra!

🔗 Operador de Armazém
🏢 DPD Portugal · 📍 Coimbra

🔗 Entregador Part-Time
🏢 CTT · 📍 Coimbra
...
```
