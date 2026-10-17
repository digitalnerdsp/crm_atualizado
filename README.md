<p align="center">
  <a href="https://kaneo.app">
    <img src="https://assets.kaneo.app/logo-text.png" alt="Kaneo's logo" width="450" />
  </a>
</p>

<div align="center">

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/usekaneo/kaneo/ci.yml?branch=main)](https://github.com/usekaneo/kaneo/actions)
[![Discord](https://img.shields.io/discord/1326250681530843178?color=7389D8&label=&logo=discord&logoColor=ffffff)](https://discord.gg/rU4tSyhXXU)
[![Sponsors](https://img.shields.io/github/sponsors/andrejsshell)](https://github.com/sponsors/andrejsshell)

</div>

<div align="center">
  <h3>
    <a href="#getting-started">Quick Start</a>
    <span> | </span>
    <a href="https://kaneo.app">Website</a>
    <span> | </span>
    <a href="https://cloud.kaneo.app">Cloud</a>
    <span> | </span>
    <a href="https://discord.gg/rU4tSyhXXU">Discord</a>
  </h3>
</div>


<p align="center">
  <img src="https://assets.kaneo.app/readme.png" alt="Kaneo Dashboard" />
</p>

## Why Kaneo?

After years of using bloated, overcomplicated project management platforms that distracted from actual work, we built Kaneo to be different.

The problem with most tools isn't that they lack features—it's that they have **too many**. Every notification, every unnecessary button, every complex workflow pulls your team away from what matters: **building great products**.

We believe the best tools are **invisible**. They should amplify your team's natural workflow, not force you to adapt to theirs. Kaneo is built on the principle that **less is more**—every feature exists because it solves a real problem, not because it looks impressive in a demo.

**What makes it different:**
- **Clean interface** that focuses on your work, not the tool
- **Self-hosted** so your data stays yours
- **Actually fast** because we care about performance
- **Open source** with a permissive MIT license

The live API reference is available to authenticated admins under **Administration > API**.

## Sponsors

Kaneo is open source. If you find it useful, consider [sponsoring the project](https://github.com/sponsors/andrejsshell) to help support ongoing development.

## Getting Started

### One-Click Deployment with drim

For straightforward deployments, use [drim](https://github.com/usekaneo/drim) - a CLI tool that handles everything for you:

```bash
curl -fsSL https://assets.kaneo.app/install.sh | sh
drim setup
```

That's it. Your Kaneo instance will be running with automatic HTTPS, database setup, and all services configured.

Perfect for quick deployments and production setups where you want things to just work.

### Quick Start with Docker Compose

The fastest way to try Nortys is with Docker Compose. This sets up Nortys and PostgreSQL with a single Nortys application container:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env_file:
      - .env
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kaneo -d kaneo"]
      interval: 10s
      timeout: 5s
      retries: 5

  nortys:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      KANEO_CLIENT_URL: ${KANEO_CLIENT_URL:-http://localhost:5173}
      AUTH_SECRET: ${SERVICE_HEX_64_AUTH}
      POSTGRES_HOST: postgres
      POSTGRES_PASSWORD: ${SERVICE_PASSWORD_64_POSTGRES}
      FILE_STORAGE_DRIVER: local
      LOCAL_UPLOAD_DIR: /app/data/uploads
    volumes:
      - nortys_uploads:/app/data/uploads
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  nortys_uploads:
```

In Coolify, `SERVICE_HEX_64_AUTH` and `SERVICE_PASSWORD_64_POSTGRES` are generated automatically on first deploy. For local Docker Compose, copy `.env.sample` to `.env`, set `KANEO_CLIENT_URL=http://localhost:5173`, `POSTGRES_PASSWORD=<password>`, and `AUTH_SECRET=<output of openssl rand -hex 32>`, then temporarily mirror them as `SERVICE_HEX_64_AUTH` and `SERVICE_PASSWORD_64_POSTGRES` or export those variables before running `docker compose up -d --build`.

In Docker Compose, the bundled Nortys container reaches PostgreSQL at the service hostname `postgres`.
If you run the API on your host instead of inside Compose, use `localhost` or set `DATABASE_URL` explicitly.

For Coolify, use the root `compose.yml` and see [COOLIFY.md](./COOLIFY.md).

### Development Setup

For development, see our [Environment Setup Guide](ENVIRONMENT_SETUP.md) for detailed instructions on configuring environment variables and troubleshooting common issues like CORS problems.

### Configuration

Kaneo requires several environment variables to be configured. The Docker Compose setup above handles the database automatically, but you'll need to configure environment variables for the API and web services.

For complete configuration instructions, including environment variables and database setup for non-Docker deployments, see [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md). After signing in as an admin or superadmin, the live API reference is available under **Administration > API**.

## Development

Want to hack on Kaneo? See our [Environment Setup Guide](ENVIRONMENT_SETUP.md) for detailed instructions on configuring environment variables and troubleshooting common issues like CORS problems.

Quick start:
```bash
# Clone and install dependencies
git clone https://github.com/usekaneo/kaneo.git
cd kaneo
pnpm install

# Create a .env file in the root with required environment variables
# See ENVIRONMENT_SETUP.md for detailed instructions

# Start development servers
pnpm dev
```

For contributing guidelines, code structure, and development best practices, check out our [contributing guide](CONTRIBUTING.md).

## Community

- **[Discord](https://discord.gg/rU4tSyhXXU)** - Chat with users and contributors
- **[GitHub Issues](https://github.com/usekaneo/kaneo/issues)** - Bug reports and feature requests
- **API reference** - Available to authenticated admins under **Administration > API**

## Contributing

We're always looking for help, whether that's:
- Reporting bugs or suggesting features
- Improving documentation
- Contributing code
- Helping other users on Discord

Check out [CONTRIBUTING.md](CONTRIBUTING.md) for the details on how to get involved.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">
  <img src="https://repobeats.axiom.co/api/embed/3e8367ec2b2350e4fc48662df33c81dac657b833.svg" alt="Repobeats analytics image" />
</div>

<p align="center">
  Built with ❤️ by the Kaneo team and <a href="#contributors">contributors</a>
</p>
