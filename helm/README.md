# bun-cloud-agent

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square)
![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)
![AppVersion: 1.0.0](https://img.shields.io/badge/AppVersion-1.0.0-informational?style=flat-square)

Cloud-native personal AI assistant (Bun + SQLite + AI SDK)

## TL;DR

```bash
helm install my-agent ./helm --set secrets.openaiApiKey=sk-...
```

## Introduction

This chart deploys [bun-cloud-agent](https://github.com/augustinbegue/bun-cloud-agent) on a Kubernetes cluster. The application is a stateless Bun process that persists all state in SQLite on a PVC, runs an AI SDK v6 agent loop, and connects to chat platforms (Slack, Discord, Telegram) via the Chat SDK.

## Prerequisites

- Kubernetes 1.26+
- Helm 3.x
- A PersistentVolume provisioner (for SQLite storage)
- At least one AI provider API key **or** a local Ollama instance

## Installing the Chart

```bash
# From the repo root
helm install my-agent ./helm

# With a custom values file
helm install my-agent ./helm -f my-values.yaml

# With inline overrides
helm install my-agent ./helm \
  --set config.modelStrong=anthropic:claude-sonnet-4-20250514 \
  --set secrets.anthropicApiKey=sk-ant-...
```

## Uninstalling the Chart

```bash
helm uninstall my-agent
```

> **Note:** The PVC is **not** deleted on uninstall to prevent data loss. Delete it manually if needed:
> `kubectl delete pvc my-agent-bun-cloud-agent-data`

## Parameters

### Global

| Key | Description | Default |
|-----|-------------|---------|
| `replicaCount` | Number of replicas (should be 1 — SQLite is single-writer) | `1` |
| `image.repository` | Container image repository | `bun-cloud-agent` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `image.tag` | Image tag (defaults to `.Chart.AppVersion`) | `""` |
| `imagePullSecrets` | Docker registry pull secrets | `[]` |
| `nameOverride` | Override the chart name | `""` |
| `fullnameOverride` | Override the full release name | `""` |

### Service Account

| Key | Description | Default |
|-----|-------------|---------|
| `serviceAccount.create` | Create a ServiceAccount | `false` |
| `serviceAccount.name` | ServiceAccount name | `""` |

### Pod

| Key | Description | Default |
|-----|-------------|---------|
| `podAnnotations` | Additional pod annotations | `{}` |
| `podLabels` | Additional pod labels | `{}` |
| `podSecurityContext.fsGroup` | Pod filesystem group | `1000` |
| `securityContext.runAsNonRoot` | Run container as non-root | `true` |
| `securityContext.runAsUser` | Container user ID | `1000` |
| `nodeSelector` | Node selector constraints | `{}` |
| `tolerations` | Pod tolerations | `[]` |
| `affinity` | Pod affinity rules | `{}` |
| `resources` | CPU/memory resource requests & limits | `{}` |

### Service

| Key | Description | Default |
|-----|-------------|---------|
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `3000` |

### Ingress

| Key | Description | Default |
|-----|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Ingress host rules | `[{host: agent.example.com, paths: [{path: /, pathType: Prefix}]}]` |
| `ingress.tls` | Ingress TLS configuration | `[]` |

### Persistence

| Key | Description | Default |
|-----|-------------|---------|
| `persistence.enabled` | Enable SQLite PVC | `true` |
| `persistence.storageClass` | StorageClass name (empty = cluster default) | `""` |
| `persistence.accessMode` | PVC access mode | `ReadWriteOnce` |
| `persistence.size` | PVC size | `1Gi` |
| `persistence.mountPath` | Mount path inside the container | `/app/data` |

### Health Probes

| Key | Description | Default |
|-----|-------------|---------|
| `livenessProbe.httpGet.path` | Liveness endpoint | `/health` |
| `livenessProbe.initialDelaySeconds` | Delay before first check | `10` |
| `livenessProbe.periodSeconds` | Check interval | `30` |
| `readinessProbe.httpGet.path` | Readiness endpoint | `/ready` |
| `readinessProbe.initialDelaySeconds` | Delay before first check | `5` |
| `readinessProbe.periodSeconds` | Check interval | `10` |

### Agent Configuration

Non-sensitive settings stored in a ConfigMap.

| Key | Description | Default |
|-----|-------------|---------|
| `config.port` | Application listening port | `3000` |
| `config.dbPath` | SQLite database path | `/app/data/agent.db` |
| `config.systemInstructions` | Agent system prompt (empty = built-in default) | `""` |
| `config.schedulerEnabled` | Enable the task scheduler | `true` |
| `config.himalayaConfig` | Path to himalaya config for email | `""` |
| `config.ollamaBaseUrl` | Ollama endpoint URL | `http://ollama:11434/v1` |
| `config.modelFast` | Fast-tier model (`provider:model`) | `ollama:llama3.2:3b` |
| `config.modelDefault` | Default-tier model (`provider:model`) | `ollama:llama3.1:8b` |
| `config.modelStrong` | Strong-tier model (`provider:model`) | `openai:gpt-4o` |
| `config.mcpServers` | MCP server config (JSON array string) | `"[]"` |

#### Vault / OpenBao

| Key | Description | Default |
|-----|-------------|---------|
| `config.vault.addr` | Vault server URL (empty = disabled) | `""` |
| `config.vault.authMethod` | Auth method: `token`, `approle`, or `kubernetes` | `token` |
| `config.vault.k8sRole` | Kubernetes auth role name | `""` |
| `config.vault.k8sMount` | Kubernetes auth mount path | `kubernetes` |
| `config.vault.namespace` | Vault namespace (HCP Vault) | `""` |
| `config.vault.defaultMount` | Default KV v2 mount | `secret` |

### Secrets

Sensitive credentials stored in a Kubernetes Secret. Only non-empty values are mounted as env vars.

| Key | Description | Env var |
|-----|-------------|---------|
| `secrets.existingSecret` | Use a pre-existing Secret name instead | — |

#### AI Provider API Keys

Set only the keys for the providers you use. Model tiers reference providers by prefix (e.g. `openai:gpt-4o` reads `OPENAI_API_KEY`).

| Key | Env var |
|-----|---------|
| `secrets.openaiApiKey` | `OPENAI_API_KEY` |
| `secrets.anthropicApiKey` | `ANTHROPIC_API_KEY` |
| `secrets.googleGenerativeAiApiKey` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `secrets.googleVertexApiKey` | `GOOGLE_VERTEX_API_KEY` |
| `secrets.mistralApiKey` | `MISTRAL_API_KEY` |
| `secrets.cohereApiKey` | `COHERE_API_KEY` |
| `secrets.xaiApiKey` | `XAI_API_KEY` |
| `secrets.groqApiKey` | `GROQ_API_KEY` |
| `secrets.deepseekApiKey` | `DEEPSEEK_API_KEY` |
| `secrets.cerebrasApiKey` | `CEREBRAS_API_KEY` |
| `secrets.fireworksApiKey` | `FIREWORKS_API_KEY` |
| `secrets.togetherAiApiKey` | `TOGETHER_AI_API_KEY` |
| `secrets.perplexityApiKey` | `PERPLEXITY_API_KEY` |
| `secrets.azureApiKey` | `AZURE_API_KEY` |

#### AWS Bedrock

| Key | Env var |
|-----|---------|
| `secrets.awsAccessKeyId` | `AWS_ACCESS_KEY_ID` |
| `secrets.awsSecretAccessKey` | `AWS_SECRET_ACCESS_KEY` |
| `secrets.awsRegion` | `AWS_REGION` |

#### Chat Platforms

| Key | Env var |
|-----|---------|
| `secrets.slackBotToken` | `SLACK_BOT_TOKEN` |
| `secrets.slackSigningSecret` | `SLACK_SIGNING_SECRET` |
| `secrets.discordApplicationId` | `DISCORD_APPLICATION_ID` |
| `secrets.discordBotToken` | `DISCORD_BOT_TOKEN` |
| `secrets.discordPublicKey` | `DISCORD_PUBLIC_KEY` |
| `secrets.telegramBotToken` | `TELEGRAM_BOT_TOKEN` |
| `secrets.telegramSecretToken` | `TELEGRAM_SECRET_TOKEN` |

#### Vault Credentials

| Key | Env var |
|-----|---------|
| `secrets.vaultToken` | `VAULT_TOKEN` |
| `secrets.vaultRoleId` | `VAULT_ROLE_ID` |
| `secrets.vaultSecretId` | `VAULT_SECRET_ID` |

## Architecture Notes

- **Single replica** — SQLite requires a single writer. The Deployment uses `strategy.type: Recreate` to ensure no two pods write concurrently.
- **Checksum annotations** — the Deployment includes `sha256sum` checksums of the ConfigMap and Secret, so pods automatically restart when configuration changes.
- **Conditional secrets** — only non-empty secret values are rendered into the Secret resource, keeping the manifest clean.
- **Stateless process** — all state lives in SQLite on the PVC. The pod can be killed and rescheduled without data loss.

## Examples

### Minimal (Ollama only)

```yaml
# my-values.yaml
config:
  ollamaBaseUrl: "http://ollama.default.svc:11434/v1"
  modelFast: "ollama:llama3.2:3b"
  modelDefault: "ollama:llama3.1:8b"
  modelStrong: "ollama:llama3.1:70b"
```

### OpenAI + Slack

```yaml
config:
  modelStrong: "openai:gpt-4o"
secrets:
  openaiApiKey: "sk-..."
  slackBotToken: "xoxb-..."
  slackSigningSecret: "..."
```

### Multi-provider with external secret

```yaml
config:
  modelFast: "groq:llama-3.1-8b-instant"
  modelDefault: "anthropic:claude-sonnet-4-20250514"
  modelStrong: "openai:o1"
secrets:
  existingSecret: "my-agent-credentials"
```

### With Vault and Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: agent.mydomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: agent-tls
      hosts:
        - agent.mydomain.com

config:
  vault:
    addr: "https://vault.mydomain.com"
    authMethod: kubernetes
    k8sRole: bun-cloud-agent

secrets:
  openaiApiKey: "sk-..."
```
