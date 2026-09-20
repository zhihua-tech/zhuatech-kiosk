# API 摘要

- `GET /api/dashboard`
- `POST /api/terminals`
- `POST /api/policies`
- `PUT /api/terminals/{id}/policy`
- `POST /api/releases`
- `POST /api/deployments`
- `POST /api/deployments/{id}/next`
- `POST /api/deployments/{id}/results`
- `POST /api/terminals/{id}/heartbeat`
- `POST /api/terminals/{id}/commands`
- `POST /api/commands/{id}/approve`

管理端使用 `x-api-key`，设备端使用 `x-device-secret`。完整领域服务还包括策略绑定、应用发布、发布结果与命令审批。
