# ADR 0001 — Independent deployments and shared Worker artifacts

Status: accepted. Date: 2026-10-22.

Master and Worker have separate TypeScript API and React application entry points. npm workspaces share platform infrastructure and compile-time contracts without a running service dependency. The Worker entry point never receives a Master URL. No remote health or readiness checks exist.

Each installation deploys its own API, frontend, PostgreSQL server, named volume, networks, and mounted persistent configuration. PostgreSQL uses an internal network joined only by its API; frontend and API share an installation-specific application network that supports loopback host publishing on Docker Desktop. A deployment may contain only a Master or only Workers. Each Worker uses the same versioned API image and the same versioned frontend image. Runtime identity, names, and credentials are injected from files, never baked into artifacts. Tests compare actual container image IDs rather than assuming equal tags prove equality.

The extra local PostgreSQL processes consume more resources than separate databases in one server, but enforce a clear operational and credential boundary and demonstrate independently deployable Workers. Compose is the Phase 1 development deployment target; orchestration across hosts and registry release signing/promotion are later work.

The web image serves static React assets and proxies relative API requests on the installation network, avoiding environment-specific frontend builds and broad CORS. Nginx resolves the local API service dynamically so recreation does not retain a stale upstream IP. Compose waits for database/API readiness at startup, following [Docker's documented dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/).
