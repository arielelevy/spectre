# Plan de Despliegue e Infraestructura (Azure)

Este documento detalla la estrategia para llevar Spectre a producción utilizando Azure, priorizando la optimización de costos mediante instancias Spot y servicios estáticos.

## Estrategia General
- **Computo (Backend/Batch):** Azure Kubernetes Service (AKS) con uso agresivo de Spot Instances.
- **Datos (State):** ClickHouse y Redis desplegados dentro del cluster (o servicios gestionados si el presupuesto permite).
- **Frontend:** Azure Static Web Apps (SWA) para hosting global y bajo costo.
- **IaC:** OpenTofu (fork libre de Terraform).

## Topología del Cluster AKS
### Node Pools
1.  **System Pool (On-Demand):**
    *   **Tamaño:** `Standard_B2s` (o similar bajo costo).
    *   **Propósito:** Pods de sistema (CoreDNS, Metrics Server), Ingress Controller, y servicios críticos que no toleran interrupciones (Redis Master si es self-hosted).
    *   **Scaling:** Fijo (1-2 nodos).
2.  **Workload Pool (Spot Instances):**
    *   **Tamaño:** `Standard_D4s_v5` (General Purpose) o `Standard_E4s_v5` (Memory Optimized para ClickHouse).
    *   **Eviction Policy:** Delete.
    *   **Propósito:** Backend API, Batch Workers, ClickHouse Shards.
    *   **Scaling:** Autoscaling (Cluster Autoscaler) 0 -> N.

## Servicios de Datos (Self-Hosted en AKS)
Para reducir costos en la fase MVP, alojaremos las bases de datos en Kubernetes usando Helm Charts.

### ClickHouse
- **Despliegue:** Bitnami ClickHouse Helm Chart.
- **Persistencia:** Azure Disk (Premium SSD LRS) atado via PVC.
- **Topología:** 1 Shard / 1 Replica (MVP).
- **Afinidad:** Preferir nodos Spot, pero con `podAntiAffinity` para HA si escalamos réplicas.

### Redis
- **Despliegue:** Bitnami Redis Helm Chart.
- **Arquitectura:** Master-Replica.
- **Uso:** Cola de trabajos (Streams) y Cache.

## Componentes de Aplicación
### Backend (FastAPI)
- **Deployment:** ReplicaSet estándar.
- **HPA:** Escalado horizontal basado en CPU y latencia de request.
- **Ingress:** Nginx Ingress Controller + CertManager (Let's Encrypt).

### Batch Workers (Python)
- **Deployment:** Deployment estándar.
- **Escalado (KEDA):** (Futuro) Escalar basado en la longitud de la lista de Redis (`job:queue`). Si la cola crece, KEDA levanta más pods en nodos Spot.

### Frontend
- **Servicio:** Azure Static Web Apps.
- **CI/CD:** GitHub Actions construye la app React y la despliega automáticamente.
- **Routing:** API requests (`/api/*`) redirigidas al LoadBalancer del AKS via "Managed Functions" o configuración de proxy inverso propia.

## Infraestructura como Código (OpenTofu)
Estructura de archivos en `/deploy/opentofu`:

- `main.tf`: Definición del Resource Group, AKS Cluster, VNet.
- `variables.tf`: Configuración (región, tamaños de VM, credenciales).
- `outputs.tf`: Kubeconfig raw, LoadBalancer IP, SWA hostname.
- `k8s_manifests/`: (Opcional) Si usamos Tofu para aplicar Helm charts, o usamos ArgoCD.

## Seguridad
- **Secretos:** Azure Key Vault inyectado via "Azure Key Vault Provider for Secrets Store CSI Driver" (evita secretos en variables de entorno planas).
- **Red:** Network Policies para aislar ClickHouse/Redis del internet público. Solo el Ingress y los Pods internos acceden.

## Pipeline de Despliegue Sugerido
1.  **Build:** Docker build + Push a Azure Container Registry (ACR).
2.  **Infra:** `tofu apply` (asegura que el AKS exista).
3.  **Deploy Apps:** `helm upgrade --install` o `kubectl apply` actualizando la imagen.
4.  **Frontend:** Build frontend -> Deploy to SWA.
